param(
    [string]$Repository = 'az7627/circuit-lab',
    [string]$SigningDirectory = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.android/circuit-lab-signing')
)
$ErrorActionPreference = 'Stop'
$signingRoot = [IO.Path]::GetFullPath($SigningDirectory)
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($signingRoot -eq $repositoryRoot -or $signingRoot.StartsWith($repositoryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw '签名密钥必须保存在 Git 仓库之外。'
}
$null = New-Item -ItemType Directory -Path $signingRoot -Force
$identityName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $signingRoot /inheritance:r /grant:r "${identityName}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法限制签名备份目录权限。' }
$keystore = Join-Path $signingRoot 'release.jks'
$credentialFile = Join-Path $signingRoot 'credentials.dpapi.xml'
if (!(Test-Path -LiteralPath $keystore) -or !(Test-Path -LiteralPath $credentialFile)) { throw '必须先恢复 v2.9.0 的发布密钥及凭据；拒绝生成替代密钥。' }
$credentials = Import-Clixml -LiteralPath $credentialFile
$env:CIRCUIT_SIGN_STORE_PASSWORD = [Net.NetworkCredential]::new('', $credentials.StorePassword).Password
$env:CIRCUIT_SIGN_KEY_PASSWORD = [Net.NetworkCredential]::new('', $credentials.KeyPassword).Password
try {
    $keytool = (Get-Command keytool.exe -ErrorAction Stop).Source
    $certificate = (& $keytool -exportcert -rfc -keystore $keystore -alias $credentials.Alias -storepass:env CIRCUIT_SIGN_STORE_PASSWORD) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw '读取已有发布证书失败。' }
    $certificateBytes = [Convert]::FromBase64String(($certificate -replace '-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s',''))
    $fingerprint = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($certificateBytes)).ToLowerInvariant()
    $baseline = Get-Content -LiteralPath (Join-Path $repositoryRoot 'android/release-certificate.json') -Raw | ConvertFrom-Json
    if ($fingerprint -ne $baseline.sha256) { throw "发布证书与 $($baseline.baseline) 不匹配，拒绝更新 Secrets。" }
    $x509 = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificateBytes)
    $rsa = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPublicKey($x509)
    $publicKey = $rsa.ExportSubjectPublicKeyInfoPem()
    $secrets = @{
        ANDROID_KEYSTORE_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore))
        ANDROID_KEYSTORE_PASSWORD = $env:CIRCUIT_SIGN_STORE_PASSWORD
        ANDROID_KEY_ALIAS = $credentials.Alias
        ANDROID_KEY_PASSWORD = $env:CIRCUIT_SIGN_KEY_PASSWORD
        ANDROID_RELEASE_PUBLIC_KEY = $publicKey
        ANDROID_RELEASE_CERT_SHA256 = $fingerprint
    }
    foreach ($name in $secrets.Keys) {
        $secrets[$name] | & gh secret set $name --repo $Repository
        if ($LASTEXITCODE -ne 0) { throw "写入 GitHub Secret 失败：$name" }
        Write-Output "已配置 GitHub Secret：$name"
    }
    Write-Output "已核实 $($baseline.baseline) 发布证书：$fingerprint"
    Write-Output "固定发布密钥和当前 Windows 用户可解密的恢复凭据保存在：$signingRoot"
} finally {
    Remove-Item Env:CIRCUIT_SIGN_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:CIRCUIT_SIGN_KEY_PASSWORD -ErrorAction SilentlyContinue
}
