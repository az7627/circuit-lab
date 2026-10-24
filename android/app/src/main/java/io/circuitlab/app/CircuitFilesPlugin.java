package io.circuitlab.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Save JSON through Android's document picker, without storage permissions. */
@CapacitorPlugin(name = "CircuitFiles")
public class CircuitFilesPlugin extends Plugin {
    @PluginMethod
    public void saveFile(PluginCall call) {
        String content = call.getString("content");
        String name = call.getString("name", "电路实验.json");
        if (content == null || content.getBytes(StandardCharsets.UTF_8).length > 20 * 1024 * 1024) {
            call.reject("导出内容为空或超过 20 MB。");
            return;
        }
        name = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (!name.endsWith(".json")) name += ".json";
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(call, intent, "fileCreated");
        } catch (ActivityNotFoundException error) {
            call.reject("未找到系统文件管理器。", error);
        }
    }

    @ActivityCallback
    private void fileCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("saved", false));
            return;
        }
        Uri uri = result.getData().getData();
        String content = call.getString("content");
        if (uri == null || content == null) {
            call.reject("无法读取保存位置，请重试。");
            return;
        }
        getBridge().execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (stream == null) throw new java.io.IOException("无法打开文件");
                stream.write(content.getBytes(StandardCharsets.UTF_8));
                call.resolve(new JSObject().put("saved", true));
            } catch (Exception error) {
                call.reject("文件保存失败，请选择其他位置重试。", error);
            }
        });
    }
}
