import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.models.database import open_database

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def create_app(database_url: str | None = None, serve_frontend: bool = True):
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.database = open_database(database_url)
        yield
        application.state.database.kw["bind"].dispose()

    application = FastAPI(title="Parallel Life API", lifespan=lifespan)
    origins = [origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()]
    if origins:
        application.add_middleware(CORSMiddleware, allow_origins=origins,
                                   allow_methods=["GET", "POST", "PUT", "DELETE"],
                                   allow_headers=["Content-Type", "X-Guest-Token"])

    @application.middleware("http")
    async def api_headers(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            size = request.headers.get("content-length", "0")
            if size.isdigit() and int(size) > 20_000:
                return JSONResponse({"detail": "Request too large."}, status_code=413)
            response = await call_next(request)
            response.headers["Cache-Control"] = "no-store"
            return response
        return await call_next(request)

    application.include_router(router)
    legacy = ROOT / "public"
    if serve_frontend and legacy.is_dir():
        @application.get("/legacy/api/status", include_in_schema=False)
        async def legacy_status():
            return {"ai": False, "character": False}

        application.mount("/legacy", StaticFiles(directory=legacy, html=True), name="legacy")

    frontend = ROOT / "frontend" / "out"
    if serve_frontend and frontend.is_dir():
        application.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return application


app = create_app()
