# ExhiBeat Troubleshooting

## `npm run dev` shows `[vite] http proxy error: /api/... ECONNREFUSED`

Backend (port 8000) is not running. Start backend first in another terminal, then retry frontend.

## Backend keeps logging `Gemini summarisation failed ... credentials were not found`

Your `.env` is using Vertex AI but Application Default Credentials (ADC) are missing.

After the first failure, backend automatically disables AI summary for this process and falls back to naive truncation for faster responses.

If you want real Gemini summaries, switch to AI Studio key mode:

```env
GOOGLE_GENAI_USE_VERTEXAI=0
GOOGLE_API_KEY=AI...
```

Then restart backend.

## Windows cannot run PS1 scripts (`...系統上已停用指令碼執行`)

Use `-ExecutionPolicy Bypass` as shown in the startup scripts.

For persistent policy:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Windows `pip install` fails with long path errors (`Errno 2 ... long path`)

Windows default path length limits can break deep dependency extraction.

1. Enable Long Path support (recommended, run in Administrator PowerShell):
   ```powershell
   Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
     LongPathsEnabled 1
   ```
   Then reopen PowerShell and rerun setup.
2. If failing package is `litellm`, this project does not require it and it can be skipped.

## Port 8000 / 8001 / 5173 already in use

Windows:

```powershell
netstat -ano | findstr :8000
taskkill /F /PID <pid>
```

macOS/Linux:

```bash
lsof -i :8000
kill -9 <pid>
```

## Backend startup error: `Directory 'xxx' is a file`

This is usually caused by shell glob expansion for `*` on Windows.

Ensure `scripts/start_backend.ps1` does not manually append:

```text
--allow_origins "*"
```

## Calling backend in WSL while frontend runs on Windows

Add in `frontend/.env.local`:

```text
VITE_API_PROXY_TARGET=http://<wsl-ip>:8000
```

Find `<wsl-ip>` with:

```bash
ip addr | grep eth0
```
