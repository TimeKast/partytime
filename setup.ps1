# Script para configuración inicial del proyecto

Write-Host "🎉 Configuración de Rooftop Party Invitation" -ForegroundColor Cyan
Write-Host ""

# Verificar si las imágenes existen
$publicDir = "$PSScriptRoot\public"
$backgroundImg = "$publicDir\background.jpg"
$flyerImg = "$publicDir\flyer.jpg"

Write-Host "📁 Verificando estructura de carpetas..." -ForegroundColor Yellow
if (Test-Path $publicDir) {
    Write-Host "✅ Carpeta public/ existe" -ForegroundColor Green
} else {
    Write-Host "❌ Carpeta public/ no encontrada" -ForegroundColor Red
}

Write-Host ""
Write-Host "📸 Estado de las imágenes:" -ForegroundColor Yellow
if (Test-Path $backgroundImg) {
    Write-Host "✅ background.jpg encontrado" -ForegroundColor Green
} else {
    Write-Host "⚠️  background.jpg NO encontrado" -ForegroundColor Yellow
    Write-Host "   Por favor copia la imagen del fondo a: public/background.jpg" -ForegroundColor Gray
}

if (Test-Path $flyerImg) {
    Write-Host "✅ flyer.jpg encontrado" -ForegroundColor Green
} else {
    Write-Host "⚠️  flyer.jpg NO encontrado (opcional)" -ForegroundColor Yellow
}

# Verificar .env.local
Write-Host ""
Write-Host "🔐 Verificando configuración de entorno..." -ForegroundColor Yellow
$envFile = "$PSScriptRoot\.env.local"
if (Test-Path $envFile) {
    Write-Host "✅ Archivo .env.local existe" -ForegroundColor Green
} else {
    Write-Host "⚠️  Archivo .env.local NO encontrado" -ForegroundColor Yellow
    Write-Host "   Creando desde .env.example..." -ForegroundColor Gray
    Copy-Item "$PSScriptRoot\.env.example" $envFile
    Write-Host "✅ Creado .env.local - Por favor configura tus credenciales de Azure" -ForegroundColor Green
}

Write-Host ""
Write-Host "📦 Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. Copia la imagen de fondo a: public/background.jpg" -ForegroundColor White
Write-Host "2. Configura tus credenciales de Azure Cosmos DB en .env.local" -ForegroundColor White
Write-Host "3. Ejecuta: npm run dev" -ForegroundColor White
Write-Host ""
