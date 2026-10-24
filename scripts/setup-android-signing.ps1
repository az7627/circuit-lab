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
if ((Test-Path -LiteralPath $keystore) -and !(Test-Path -LiteralPath $credentialFile)) { throw '已有密钥但缺少恢复信息；拒绝覆盖，请恢复原有凭据。' }
if (Test-Path -LiteralPath $credentialFile) {
    $credentials = Import-Clixml -LiteralPath $credentialFile
} else {
    $storePassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $keyPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $credentials = [pscustomobject]@{
        Alias = 'circuit-lab'
        StorePassword = (ConvertTo-SecureString $storePassword -AsPlainText -Force)
        KeyPassword = (ConvertTo-SecureString $keyPassword -AsPlainText -Force)
    }
    $credentials | Export-Clixml -LiteralPath $credentialFile
}
$env:CIRCUIT_SIGN_STORE_PASSWORD = [Net.NetworkCredential]::new('', $credentials.StorePassword).Password
$env:CIRCUIT_SIGN_KEY_PASSWORD = [Net.NetworkCredential]::new('', $credentials.KeyPassword).Password
try {
    $keytool = (Get-Command keytool.exe -ErrorAction Stop).Source
    if (!(Test-Path -LiteralPath $keystore)) {
        & $keytool -genkeypair -storetype JKS -keystore $keystore -alias $credentials.Alias -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=Circuit Lab' -storepass:env CIRCUIT_SIGN_STORE_PASSWORD -keypass:env CIRCUIT_SIGN_KEY_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw '生成 Android 发布密钥失败。' }
    }
    $secrets = @{
        ANDROID_KEYSTORE_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore))
        ANDROID_KEYSTORE_PASSWORD = $env:CIRCUIT_SIGN_STORE_PASSWORD
        ANDROID_KEY_ALIAS = $credentials.Alias
        ANDROID_KEY_PASSWORD = $env:CIRCUIT_SIGN_KEY_PASSWORD
    }
    foreach ($name in $secrets.Keys) {
        $secrets[$name] | & gh secret set $name --repo $Repository
        if ($LASTEXITCODE -ne 0) { throw "写入 GitHub Secret 失败：$name" }
        Write-Output "已配置 GitHub Secret：$name"
    }
    & $keytool -list -v -keystore $keystore -alias $credentials.Alias -storepass:env CIRCUIT_SIGN_STORE_PASSWORD | Select-String -Pattern 'SHA256:'
    Write-Output "固定发布密钥和当前 Windows 用户可解密的恢复凭据保存在：$signingRoot"
} finally {
    Remove-Item Env:CIRCUIT_SIGN_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:CIRCUIT_SIGN_KEY_PASSWORD -ErrorAction SilentlyContinue
}
