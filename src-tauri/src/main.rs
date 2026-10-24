#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::{WebviewWindowBuilder, WebviewUrl, webview::PageLoadEvent};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn save_experiment(app: tauri::AppHandle, content: String, name: String) -> Result<bool, String> {
    if content.len() > 20 * 1024 * 1024 { return Err("实验文件过大".into()); }
    serde_json::from_str::<serde_json::Value>(&content).map_err(|_| "实验文件必须为 JSON")?;
    let filename = std::path::Path::new(&name).file_name().and_then(|v| v.to_str()).unwrap_or("实验.json");
    let target = if std::env::var_os("CIRCUIT_LAB_SYSTEM_SMOKE_REPORT").is_some() {
        std::env::var_os("CIRCUIT_LAB_SYSTEM_SMOKE_EXPORT").map(std::path::PathBuf::from)
    } else {
        app.dialog().file().set_title("导出电路实验").set_file_name(filename).add_filter("实验 JSON 文件", &["json"])
            .blocking_save_file().and_then(|v| v.into_path().ok())
    };
    let Some(target) = target else { return Ok(false); };
    std::fs::write(target, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn set_fullscreen(window: tauri::WebviewWindow, fullscreen: bool) -> Result<(), String> {
    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())
}

#[tauri::command]
fn system_smoke_report(app: tauri::AppHandle, report: serde_json::Value) -> Result<(), String> {
    let path=std::env::var_os("CIRCUIT_LAB_SYSTEM_SMOKE_REPORT").ok_or("未启用测试模式")?;
    std::fs::write(path, report.to_string()).map_err(|e| e.to_string())?;
    app.exit(if report.get("error").is_some() { 1 } else { 0 });
    Ok(())
}

fn main() {
    tauri::Builder::default().plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_experiment, set_fullscreen, system_smoke_report])
        .setup(|app| {
            let smoke=std::env::var_os("CIRCUIT_LAB_SYSTEM_SMOKE_REPORT").is_some();
            let mut builder=WebviewWindowBuilder::new(app,"main",WebviewUrl::App("index.html".into()))
                .title("电路实验室 · 系统 WebView 版").inner_size(1440.0,940.0).min_inner_size(360.0,600.0)
                .visible(false).incognito(smoke)
                .on_navigation(|url| matches!(url.scheme(),"tauri"|"about") || url.host_str().is_some_and(|host|host=="tauri.localhost"||host=="localhost"))
                .on_page_load(move |window,payload| {
                    if smoke && payload.event()==PageLoadEvent::Finished { let _=window.eval(include_str!("../smoke.js")); }
                });
            #[cfg(any(target_os="windows",target_os="linux"))]
            if let Some(profile)=std::env::var_os("CIRCUIT_LAB_SYSTEM_DATA_DIR") { builder=builder.data_directory(profile.into()); }
            let window=builder.build()?;
            if !smoke { window.show()?; }
            Ok(())
        }).run(tauri::generate_context!()).expect("系统 WebView 版启动失败");
}
