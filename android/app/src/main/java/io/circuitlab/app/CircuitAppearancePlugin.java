package io.circuitlab.app;

import android.content.res.Configuration;
import android.webkit.JavascriptInterface;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="CircuitAppearance")
public class CircuitAppearancePlugin extends Plugin {
    private volatile boolean dark;
    private volatile String safeArea = "[0,0,0,0]";
    public class SystemTheme {
        @JavascriptInterface public boolean isDark(){return dark;}
        @JavascriptInterface public String safeArea(){return safeArea;}
    }
    @Override public void load(){
        update(getContext().getResources().getConfiguration());
        getBridge().getWebView().addJavascriptInterface(new SystemTheme(),"CircuitSystemTheme");
        getActivity().runOnUiThread(() -> {
            var decor = getActivity().getWindow().getDecorView();
            ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
                int bars = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
                int ime = WindowInsetsCompat.Type.ime();
                Insets area = insets.getInsets(bars);
                boolean keyboard = insets.isVisible(ime);
                float density = view.getResources().getDisplayMetrics().density;
                String next = "[" + area.top / density + "," + area.right / density + ","
                    + (keyboard ? 0 : area.bottom / density) + "," + area.left / density + "]";
                if (!next.equals(safeArea)) {
                    safeArea = next;
                    getBridge().getWebView().evaluateJavascript(
                        "window.circuitLabSetSafeArea?.(" + next + ")", null);
                }
                view.setPadding(0, 0, 0, keyboard ? insets.getInsets(ime).bottom : 0);
                // The page handles the bars and the decor handles the keyboard on older WebViews too.
                return new WindowInsetsCompat.Builder(insets)
                    .setInsets(bars | ime, Insets.NONE).build();
            });
            ViewCompat.requestApplyInsets(decor);
        });
    }
    private void update(Configuration configuration){dark=(configuration.uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;}
    private JSObject appearance(){return new JSObject().put("dark",dark);}
    @PluginMethod public void getSystemTheme(PluginCall call){call.resolve(appearance());}
    @Override protected void handleOnConfigurationChanged(Configuration configuration){update(configuration);notifyListeners("themeChanged",appearance(),true);}
    @Override protected void handleOnResume(){update(getContext().getResources().getConfiguration());notifyListeners("themeChanged",appearance(),true);}
}
