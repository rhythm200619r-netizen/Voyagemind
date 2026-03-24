from __future__ import annotations

from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.agents.orchestrator import run_orchestration
from app.settings import settings
from app.supabase_client import get_supabase_admin_client

app = FastAPI(title="VoyageMind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)


class CreateRunRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    user_id: str | None = None
    orchestrator_persona: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class CreateRunResponse(BaseModel):
    run_id: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/runs", response_model=CreateRunResponse)
def create_run(req: CreateRunRequest, background: BackgroundTasks) -> CreateRunResponse:
    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    insert_payload: dict[str, Any] = {
        "prompt": req.prompt,
        "status": "queued",
        "metadata": req.metadata,
    }
    if req.user_id:
        insert_payload["user_id"] = req.user_id
    if req.orchestrator_persona:
        insert_payload["orchestrator_persona"] = req.orchestrator_persona

    created = supabase.table("agent_runs").insert(insert_payload).execute()
    if not created.data:
        raise HTTPException(status_code=500, detail="Failed to create run")

    run_id = created.data[0]["id"]

    def safe_runner() -> None:
        try:
            run_orchestration(supabase=supabase, run_id=run_id, prompt=req.prompt)
        except Exception as exc:  # noqa: BLE001
            supabase.table("agent_events").insert(
                {
                    "run_id": run_id,
                    "agent_name": "Orchestrator",
                    "event_type": "error",
                    "content": str(exc),
                    "payload": {},
                }
            ).execute()
            supabase.table("agent_runs").update({"status": "failed"}).eq("id", run_id).execute()

    background.add_task(safe_runner)

    return CreateRunResponse(run_id=run_id)


@app.get("/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    try:
        supabase = get_supabase_admin_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    res = supabase.table("agent_runs").select("*").eq("id", run_id).maybe_single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Run not found")
    return res.data
