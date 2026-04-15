"""ExhiBeat Gemini agent package."""

try:
    from . import agent  # noqa: F401
except ModuleNotFoundError:
    # Allow tool-only imports in environments that do not install google-adk.
    agent = None
