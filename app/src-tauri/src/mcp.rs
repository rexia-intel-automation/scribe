use crate::{now_ms, Core};
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{
        CacheScope, CallToolResult, ContentBlock, Implementation, ListToolsResult,
        PaginatedRequestParams, ServerCapabilities, ServerConfig,
    },
    schemars, tool, tool_handler, tool_router, ErrorData, ServerHandler,
};
use serde::Deserialize;

#[derive(Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct Report {
    session_id: String,
    #[schemars(length(min = 1, max = 140))]
    text: String,
}

#[derive(Deserialize, schemars::JsonSchema)]
#[serde(transparent)]
struct OptionText(#[schemars(length(min = 1, max = 40))] String);

#[derive(Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct Question {
    session_id: String,
    #[schemars(length(min = 1, max = 200))]
    question: String,
    #[schemars(length(min = 2, max = 4))]
    options: Vec<OptionText>,
}

#[derive(Clone)]
pub(crate) struct ScribeMcp {
    core: Core,
    tool_router: ToolRouter<Self>,
}

impl ScribeMcp {
    pub(crate) fn new(core: Core) -> Self {
        Self {
            core,
            tool_router: Self::tool_router(),
        }
    }
}

fn output(value: serde_json::Value) -> CallToolResult {
    CallToolResult::success(vec![ContentBlock::text(value.to_string())])
}

#[tool_router]
impl ScribeMcp {
    #[tool(
        description = "Record one sanitized progress milestone for the current Claude Code session. Never include secrets, environment or file contents."
    )]
    async fn scribe_report(
        &self,
        Parameters(input): Parameters<Report>,
    ) -> Result<CallToolResult, ErrorData> {
        if !crate::model::identifier(&input.session_id)
            || input.text.is_empty()
            || input.text.chars().count() > 140
        {
            return Err(ErrorData::invalid_params("Invalid report arguments", None));
        }
        let core = self.core.clone();
        let result = tokio::task::spawn_blocking(move || {
            core.report(&input.session_id, &input.text, now_ms())
        })
        .await;
        match result {
            Ok(Ok(())) => Ok(output(serde_json::json!({"ok":true}))),
            _ => Err(ErrorData::invalid_params(
                "Report requires an available live session",
                None,
            )),
        }
    }

    #[tool(
        description = "Ask the human a short question with two to four options. A null answer is not consent. Use the current Claude Code session ID."
    )]
    async fn scribe_ask(
        &self,
        Parameters(input): Parameters<Question>,
        context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        if !crate::model::identifier(&input.session_id)
            || input.question.is_empty()
            || input.question.chars().count() > 200
            || !(2..=4).contains(&input.options.len())
            || input
                .options
                .iter()
                .any(|s| s.0.is_empty() || s.0.chars().count() > 40)
        {
            return Err(ErrorData::invalid_params(
                "Invalid question arguments",
                None,
            ));
        }
        let options: Vec<_> = input.options.into_iter().map(|s| s.0).collect();
        let wait = self
            .core
            .question(&input.session_id, &input.question, &options, 600);
        Ok(output(match wait {
            Ok(wait) => tokio::select! {
                answer = wait.receive() => answer,
                _ = context.ct.cancelled() => serde_json::json!({"answer":null,"reason":"scribe_unavailable"}),
            },
            Err(_) => serde_json::json!({"answer":null,"reason":"scribe_unavailable"}),
        }))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for ScribeMcp {
    async fn list_tools(
        &self,
        _: Option<PaginatedRequestParams>,
        _: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult::with_all_items(self.tool_router.list_all())
            .with_ttl_ms(0)
            .with_cache_scope(CacheScope::Private))
    }

    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("scribe", env!("CARGO_PKG_VERSION")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_helper_tool_schema_matches_app() {
        let expected: serde_json::Value =
            serde_json::from_str(scribe_hook_protocol::MCP_TOOLS).unwrap();
        let actual = serde_json::to_value(ScribeMcp::tool_router().list_all()).unwrap();
        assert_eq!(
            actual, expected,
            "Update the paired native helper tool definitions"
        );
    }
}
