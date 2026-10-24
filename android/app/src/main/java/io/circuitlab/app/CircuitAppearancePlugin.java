package io.circuitlab.app;

import android.content.res.Configuration;
import android.webkit.JavascriptInterface;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="CircuitAppearance")
public class CircuitAppearancePlugin extends Plugin {
    private volatile boolean dark;
    public class SystemTheme {
        @JavascriptInterface public boolean isDark(){return dark;}
    }
    @Override public void load(){
        update(getContext().getResources().getConfiguration());
        getBridge().getWebView().addJavascriptInterface(new SystemTheme(),"CircuitSystemTheme");
    }
    private void update(Configuration configuration){dark=(configuration.uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;}
    private JSObject appearance(){return new JSObject().put("dark",dark);}
    @PluginMethod public void getSystemTheme(PluginCall call){call.resolve(appearance());}
    @Override protected void handleOnConfigurationChanged(Configuration configuration){update(configuration);notifyListeners("themeChanged",appearance(),true);}
    @Override protected void handleOnResume(){update(getContext().getResources().getConfiguration());notifyListeners("themeChanged",appearance(),true);}
}
