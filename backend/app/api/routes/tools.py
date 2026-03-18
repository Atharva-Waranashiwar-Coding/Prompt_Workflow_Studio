from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.tool import ToolDefinitionRead, ToolInvocationRequest, ToolInvocationResponse
from app.services.tool_service import invoke_tool_by_name
from app.tools.registry import list_tool_definitions

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=list[ToolDefinitionRead])
def get_tools_catalog(
    _: User = Depends(get_current_user),
) -> list[ToolDefinitionRead]:
    return [
        ToolDefinitionRead(
            name=tool.name,
            title=tool.title,
            description=tool.description,
            parameter_schema=tool.parameter_schema,
            default_params=tool.default_params,
        )
        for tool in list_tool_definitions()
    ]


def _invoke(db: Session, tool_name: str, payload: ToolInvocationRequest) -> ToolInvocationResponse:
    try:
        output = invoke_tool_by_name(db, tool_name=tool_name, params=payload.params, context=payload.context)
        db.commit()
        return ToolInvocationResponse(tool_name=tool_name, output=output)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/template_fetch", response_model=ToolInvocationResponse, tags=["mcp-tools"])
def post_template_fetch(
    payload: ToolInvocationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ToolInvocationResponse:
    return _invoke(db, "template_fetch", payload)


@router.post("/memory_read", response_model=ToolInvocationResponse, tags=["mcp-tools"])
def post_memory_read(
    payload: ToolInvocationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ToolInvocationResponse:
    return _invoke(db, "memory_read", payload)


@router.post("/memory_write", response_model=ToolInvocationResponse, tags=["mcp-tools"])
def post_memory_write(
    payload: ToolInvocationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ToolInvocationResponse:
    return _invoke(db, "memory_write", payload)


@router.post("/document_lookup", response_model=ToolInvocationResponse, tags=["mcp-tools"])
def post_document_lookup(
    payload: ToolInvocationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ToolInvocationResponse:
    return _invoke(db, "document_lookup", payload)


@router.post("/output_schema_validate", response_model=ToolInvocationResponse, tags=["mcp-tools"])
def post_output_schema_validate(
    payload: ToolInvocationRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ToolInvocationResponse:
    return _invoke(db, "output_schema_validate", payload)
