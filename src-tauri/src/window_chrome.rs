use serde_json::{json, Value};
use tauri::WebviewWindow;

pub const MIN_WIDTH: f64 = 360.0;
pub const MIN_HEIGHT: f64 = 600.0;

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
        "windows": cfg!(target_os = "windows"),
        "left": left,
        "right": right,
    }))
}

#[tauri::command]
pub fn desktop_window_drag_start(window: WebviewWindow, moving: bool) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    return windows_drag::start(&window, moving);
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, moving);
        Err("此平台使用系统窗口边框".into())
    }
}

#[tauri::command]
pub fn desktop_window_drag_apply(
    window: WebviewWindow,
    moving: bool,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    return windows_drag::apply(&window, moving, x, y, width, height);
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, moving, x, y, width, height);
        Err("此平台使用系统窗口边框".into())
    }
}

#[cfg(target_os = "windows")]
mod windows_drag {
    use super::*;
    use std::ptr::null_mut;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER,
    };

    fn check_window(window: &WebviewWindow, moving: bool) -> Result<(), String> {
        if window.is_decorated().map_err(|e| e.to_string())?
            || window.is_fullscreen().map_err(|e| e.to_string())?
            || (!moving && window.is_maximized().map_err(|e| e.to_string())?)
        {
            return Err("当前窗口状态无法拖动".into());
        }
        Ok(())
    }

    fn minimum_size(window: &WebviewWindow) -> Result<(i32, i32), String> {
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let inner = window.inner_size().map_err(|e| e.to_string())?;
        let outer = window.outer_size().map_err(|e| e.to_string())?;
        Ok((
            (MIN_WIDTH * scale).ceil() as i32 + outer.width.saturating_sub(inner.width) as i32,
            (MIN_HEIGHT * scale).ceil() as i32 + outer.height.saturating_sub(inner.height) as i32,
        ))
    }

    pub fn start(window: &WebviewWindow, moving: bool) -> Result<Value, String> {
        check_window(window, moving)?;
        let maximized = window.is_maximized().map_err(|e| e.to_string())?;
        let (position, size) = if maximized {
            (window.inner_position(), window.inner_size())
        } else {
            (window.outer_position(), window.outer_size())
        };
        let origin = position.map_err(|e| e.to_string())?;
        let size = size.map_err(|e| e.to_string())?;
        let (min_width, min_height) = minimum_size(window)?;
        Ok(json!({
            "x": origin.x, "y": origin.y, "width": size.width, "height": size.height,
            "minWidth": min_width, "minHeight": min_height, "maximized": maximized
        }))
    }

    pub fn apply(
        window: &WebviewWindow,
        moving: bool,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    ) -> Result<(), String> {
        check_window(window, false)?;
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let (width, height, flags) = if moving {
            (0, 0, SWP_NOSIZE)
        } else {
            let (min_width, min_height) = minimum_size(window)?;
            (width.max(min_width), height.max(min_height), 0)
        };
        // Update all four edges in one native operation, especially for north
        // and west handles where the window's origin changes while resizing.
        if unsafe {
            SetWindowPos(
                hwnd.0,
                null_mut(),
                x,
                y,
                width,
                height,
                flags | SWP_NOZORDER | SWP_NOACTIVATE,
            )
        } == 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
}

#[tauri::command]
pub fn desktop_window_action(window: WebviewWindow, action: &str) -> Result<(), String> {
    let result = match action {
        "minimize" => window.minimize(),
        "close" => window.close(),
        "restore" => window.unmaximize(),
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
    use gtk::prelude::{GtkSettingsExt, WidgetExt};
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
