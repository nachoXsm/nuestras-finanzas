Write-Host ""
Write-Host "=== Deploy IA Advisor - Nuestras Finanzas ===" -ForegroundColor Cyan
Write-Host ""

# Pedir token de Supabase
Write-Host "Paso 1: Ingresa tu Supabase Access Token (app.supabase.com -> Account -> Access Tokens)" -ForegroundColor Yellow
Write-Host "        Debe empezar con sbp_..." -ForegroundColor Gray
$sbToken = Read-Host "   Token"

# Pedir key de Groq
Write-Host ""
Write-Host "Paso 2: Ingresa tu Groq API Key (console.groq.com -> API Keys)" -ForegroundColor Yellow
Write-Host "        Debe empezar con gsk_..." -ForegroundColor Gray
$groqKey = Read-Host "   Key"

Write-Host ""
Write-Host "Configurando sesion de Supabase..." -ForegroundColor Cyan
$env:SUPABASE_ACCESS_TOKEN = $sbToken

Write-Host "Conectando al proyecto..." -ForegroundColor Cyan
supabase link --project-ref gzjhohwuyquumkgiehan

Write-Host "Guardando API key de Groq de forma segura..." -ForegroundColor Cyan
supabase secrets set GROQ_KEY=$groqKey

Write-Host "Subiendo la funcion IA..." -ForegroundColor Cyan
supabase functions deploy ai-advisor --no-verify-jwt

Write-Host ""
Write-Host "=== Listo! La IA esta activa en la app ===" -ForegroundColor Green
Write-Host ""
