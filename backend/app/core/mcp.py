import inspect
import logging
from typing import Any

from fastapi import FastAPI

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _import_fastapi_mcp() -> Any:
    try:
        from fastapi_mcp import FastApiMCP  # type: ignore

        return FastApiMCP
    except Exception:
        try:
            from tadata.fastapi_mcp import FastApiMCP  # type: ignore

            return FastApiMCP
        except Exception:
            return None


def _build_mcp_instance(fastapi_mcp_cls: Any, app: FastAPI) -> Any:
    settings = get_settings()

    kwargs: dict[str, Any] = {}
    try:
        signature = inspect.signature(fastapi_mcp_cls)
        parameters = signature.parameters

        if "app" in parameters:
            kwargs["app"] = app
        if "name" in parameters:
            kwargs["name"] = "Prompt Workflow Studio Tools"
        if "description" in parameters:
            kwargs["description"] = "MCP surface for Prompt Workflow Studio internal tool endpoints"
        if "include_tags" in parameters:
            kwargs["include_tags"] = ["mcp-tools"]
        if "path" in parameters:
            kwargs["path"] = settings.mcp_mount_path
        if "base_url" in parameters:
            kwargs["base_url"] = settings.mcp_mount_path

        if kwargs:
            return fastapi_mcp_cls(**kwargs)
    except Exception:
        pass

    try:
        return fastapi_mcp_cls(app)
    except Exception:
        return fastapi_mcp_cls()


def mount_mcp_tools(app: FastAPI) -> None:
    settings = get_settings()
    if not settings.enable_mcp_tools:
        logger.info("MCP tools mounting disabled by configuration.")
        return

    fastapi_mcp_cls = _import_fastapi_mcp()
    if fastapi_mcp_cls is None:
        logger.warning("fastapi-mcp is not installed; MCP tool surface is disabled.")
        return

    mcp_instance = _build_mcp_instance(fastapi_mcp_cls, app)

    for method_name in ("mount", "mount_http", "init_app", "register"):
        method = getattr(mcp_instance, method_name, None)
        if method is None:
            continue

        for call_args in ((), (app,), (settings.mcp_mount_path,)):
            try:
                method(*call_args)
                logger.info("Mounted fastapi-mcp for tools using method '%s'.", method_name)
                return
            except TypeError:
                continue
            except Exception as exc:
                logger.warning("Failed MCP mount attempt via %s: %s", method_name, exc)
                break

    logger.warning("Unable to mount fastapi-mcp for tools with the available API surface.")
