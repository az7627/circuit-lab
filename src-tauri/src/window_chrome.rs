use serde_json::{json, Value};
use tauri::WebviewWindow;

#[tauri::command]
pub fn set_title_bar_hidden(window: WebviewWindow, hidden: bool) -> Result<(), String> {
    window
        .set_decorations(!hidden)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn desktop_window_state(window: WebviewWindow) -> Result<Value, String> {
    let fullscreen = window.is_fullscreen().map_err(|error| error.to_string())?;
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    let decorated = window.is_decorated().map_err(|error| error.to_string())?;
    let (left, right) = window_controls(&window);
    Ok(json!({
        "fullscreen": fullscreen,
        "maximized": maximized,
        "decorated": decorated,
        "macos": cfg!(target_os = "macos"),
        "left": left,
        "right": right,
    }))
}

#[tauri::command]
pub fn desktop_window_action(window: WebviewWindow, action: &str) -> Result<(), String> {
    let result = match action {
        "minimize" => window.minimize(),
        "close" => window.close(),
        "maximize" => {
            if window.is_maximized().map_err(|error| error.to_string())? {
                window.unmaximize()
            } else {
                window.maximize()
            }
        }
        _ => return Err("未知窗口操作".into()),
    };
    result.map_err(|error| error.to_string())
}

type Controls = (Vec<&'static str>, Vec<&'static str>);

#[cfg(target_os = "macos")]
fn window_controls(_: &WebviewWindow) -> Controls {
    (vec!["close", "minimize", "maximize"], vec![])
}

#[cfg(target_os = "windows")]
fn window_controls(_: &WebviewWindow) -> Controls {
    (vec![], vec!["minimize", "maximize", "close"])
}

#[cfg(target_os = "linux")]
fn window_controls(window: &WebviewWindow) -> Controls {
    use gtk::prelude::{SettingsExt, WidgetExt};
    use std::process::Command;

    fn read(command: &str, args: &[&str]) -> Option<String> {
        let output = Command::new(command).args(args).output().ok()?;
        output
            .status
            .success()
            .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
    }

    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_ascii_lowercase();
    if desktop
        .split(':')
        .any(|name| matches!(name, "kde" | "plasma"))
    {
        for command in ["kreadconfig6", "kreadconfig5"] {
            let buttons = |key, default| {
                read(
                    command,
                    &[
                        "--file",
                        "kwinrc",
                        "--group",
                        "org.kde.kdecoration2",
                        "--key",
                        key,
                        "--default",
                        default,
                    ],
                )
            };
            if let (Some(left), Some(right)) = (
                buttons("ButtonsOnLeft", "MS"),
                buttons("ButtonsOnRight", "IAX"),
            ) {
                return (
                    letter_controls(&left, 'I', 'A', 'X'),
                    letter_controls(&right, 'I', 'A', 'X'),
                );
            }
        }
    }
    if desktop.split(':').any(|name| name == "xfce") {
        if let Some(layout) = read(
            "xfconf-query",
            &["-c", "xfwm4", "-p", "/general/button_layout"],
        ) {
            if let Some((left, right)) = layout.split_once('|') {
                return (
                    letter_controls(left, 'H', 'M', 'C'),
                    letter_controls(right, 'H', 'M', 'C'),
                );
            }
        }
    }
    let layout = window
        .gtk_window()
        .ok()
        .and_then(|window| window.settings())
        .and_then(|settings| settings.gtk_decoration_layout());
    let (left, right) = layout
        .as_deref()
        .unwrap_or(":minimize,maximize,close")
        .split_once(':')
        .unwrap_or(("", "minimize,maximize,close"));
    let controls = |side: &str| {
        side.split(',')
            .filter_map(|button| match button.trim() {
                "minimize" => Some("minimize"),
                "maximize" => Some("maximize"),
                "close" => Some("close"),
                _ => None,
            })
            .collect()
    };
    (controls(left), controls(right))
}

#[cfg(target_os = "linux")]
fn letter_controls(side: &str, minimize: char, maximize: char, close: char) -> Vec<&'static str> {
    side.chars()
        .filter_map(|button| {
            if button == minimize {
                Some("minimize")
            } else if button == maximize {
                Some("maximize")
            } else if button == close {
                Some("close")
            } else {
                None
            }
        })
        .collect()
}
