# generate-cert.ps1
# Creates a self-signed code-signing certificate for local Windows builds.
# Run this once from an elevated (Administrator) PowerShell prompt.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\generate-cert.ps1
#
# After running:
#   1. Copy the thumbprint printed below into tauri.conf.json
#      under bundle.windows.certificateThumbprint
#   2. Keep petro-graphs-codesign.pfx as a backup — add it to .gitignore
#   3. Re-run `npm run tauri:build` — the installer will be signed

$subject  = "CN=Petro Graphs, O=Vanderbilt University, C=US"
$pfxFile  = Join-Path $PSScriptRoot "..\petro-graphs-codesign.pfx"
$pfxPass  = "petro-graphs-dev"

Write-Host ""
Write-Host "Generating self-signed code-signing certificate..." -ForegroundColor Cyan

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $subject `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(5)

$thumbprint = $cert.Thumbprint

Write-Host ""
Write-Host "Certificate created!" -ForegroundColor Green
Write-Host "  Thumbprint : $thumbprint"
Write-Host "  Subject    : $subject"
Write-Host "  Expires    : $($cert.NotAfter.ToString('yyyy-MM-dd'))"
Write-Host ""

# Export PFX for CI / backup
$secPwd = ConvertTo-SecureString -String $pfxPass -Force -AsPlainText
Export-PfxCertificate -Cert "Cert:\CurrentUser\My\$thumbprint" `
  -FilePath $pfxFile -Password $secPwd | Out-Null

Write-Host "PFX backup written to: $pfxFile" -ForegroundColor Yellow
Write-Host "PFX password          : $pfxPass"
Write-Host ""
Write-Host "------------------------------------------------------------"
Write-Host "Add this to src-tauri/tauri.conf.json under `"bundle`":"
Write-Host ""
Write-Host '    "windows": {'
Write-Host "      `"certificateThumbprint`": `"$thumbprint`","
Write-Host '      "digestAlgorithm": "sha256",'
Write-Host '      "timestampUrl": "http://timestamp.digicert.com"'
Write-Host '    }'
Write-Host "------------------------------------------------------------"
Write-Host ""
Write-Host "To use the PFX in GitHub Actions, base64-encode it and store"
Write-Host "as a repository secret named WINDOWS_CERTIFICATE:"
Write-Host ""
Write-Host "  [Convert]::ToBase64String([IO.File]::ReadAllBytes('$pfxFile'))"
Write-Host "  | clip"
Write-Host ""
Write-Host "Then add WINDOWS_CERTIFICATE_PASSWORD = `"$pfxPass`" as well."
Write-Host "Finally, uncomment the 'Import Windows code-signing certificate'"
Write-Host "step in .github/workflows/release.yml."
Write-Host ""
