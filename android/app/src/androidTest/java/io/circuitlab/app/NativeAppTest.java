package io.circuitlab.app;

import static androidx.test.espresso.intent.Intents.intending;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import static org.junit.Assert.*;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.res.Configuration;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.espresso.intent.Intents;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeAppTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, result -> {
            value.set(result);
            done.countDown();
        }));
        assertTrue("WebView evaluation timed out", done.await(10, TimeUnit.SECONDS));
        return value.get();
    }

    private void awaitValue(ActivityScenario<MainActivity> scenario, String script, String expected) throws Exception {
        long deadline = System.currentTimeMillis() + 30000;
        String actual;
        do {
            actual = evaluate(scenario, script);
            if (expected.equals(actual)) return;
            Thread.sleep(200);
        } while (System.currentTimeMillis() < deadline);
        assertEquals(script, expected, actual);
    }

    private void awaitSystemBars(ActivityScenario<MainActivity> scenario, boolean visible) throws Exception {
        AtomicBoolean matches = new AtomicBoolean(false);
        long deadline = System.currentTimeMillis() + 10000;
        do {
            scenario.onActivity(activity -> {
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(activity.getWindow().getDecorView());
                matches.set(insets != null &&
                    insets.isVisible(WindowInsetsCompat.Type.statusBars()) == visible &&
                    insets.isVisible(WindowInsetsCompat.Type.navigationBars()) == visible);
            });
            if (matches.get()) return;
            Thread.sleep(100);
        } while (System.currentTimeMillis() < deadline);
        assertTrue("Status and navigation bar visibility did not match " + visible, matches.get());
    }

    @Test
    public void nativeNightThemeReachesWebViewAndManualOverrideWins() throws Exception {
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            awaitValue(scenario,"document.querySelectorAll('[data-add]').length","14");
            evaluate(scenario,"document.getElementById('themeSetting').value='system';document.getElementById('themeSetting').dispatchEvent(new Event('change'));");
            for(boolean dark:new boolean[]{true,false}){
                scenario.onActivity(activity->AppCompatDelegate.setDefaultNightMode(dark?AppCompatDelegate.MODE_NIGHT_YES:AppCompatDelegate.MODE_NIGHT_NO));
                awaitValue(scenario,"CircuitSystemTheme.isDark()",String.valueOf(dark));
                awaitValue(scenario,"document.documentElement.dataset.theme",dark?"\"dark\"":"\"light\"");
            }
            evaluate(scenario,"document.getElementById('themeSetting').value='dark';document.getElementById('themeSetting').dispatchEvent(new Event('change'));");
            awaitValue(scenario,"document.documentElement.dataset.theme","\"dark\"");
            evaluate(scenario,"document.getElementById('themeSetting').value='system';document.getElementById('themeSetting').dispatchEvent(new Event('change'));");
        } finally { androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().runOnMainSync(()->AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)); }
    }

    @Test
    public void offlineWorkbenchPersistsAndNativeJsonExportHandlesSaveAndCancel() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitValue(scenario, "document.querySelectorAll('[data-add]').length", "14");
            assertEquals("\"android\"", evaluate(scenario, "Capacitor.getPlatform()"));
            assertEquals("\"function\"", evaluate(scenario, "typeof Capacitor.Plugins.CircuitFiles.saveFile"));
            evaluate(scenario, "document.getElementById(document.getElementById('workspace').hidden?'emptyCreateButton':'newExperimentButton').click();" +
                "document.getElementById('experimentNameInput').value='Android 保存验证';" +
                "document.getElementById('nameForm').requestSubmit();" +
                "document.getElementById('helpButton').click();" +
                "document.querySelector('[data-guide=series]').click();" +
                "document.getElementById('startGuideExperiment').click();");
            scenario.recreate();
            awaitValue(scenario, "document.getElementById('activeExperimentName')?.textContent", "\"Android 保存验证\"");
            assertEquals("true", evaluate(scenario, "document.getElementById('inspector').hidden"));
            evaluate(scenario, "document.querySelector('[data-component=a1]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
            assertEquals("true", evaluate(scenario, "parseFloat(document.getElementById('selectedCurrent').textContent)>0"));
            evaluate(scenario, "document.getElementById('fullscreenButton').click()");
            awaitValue(scenario, "document.getElementById('fullscreenButton').getAttribute('aria-pressed')", "\"true\"");
            awaitSystemBars(scenario, false);
            evaluate(scenario, "window.dispatchEvent(new Event('circuitlab:back', {cancelable:true}))");
            awaitValue(scenario, "document.getElementById('fullscreenButton').getAttribute('aria-pressed')", "\"false\"");
            awaitSystemBars(scenario, true);

            AtomicReference<File> file = new AtomicReference<>();
            AtomicReference<Intent> savedResult = new AtomicReference<>();
            scenario.onActivity(activity -> {
                File target = new File(activity.getCacheDir(), "native-export-test.json");
                file.set(target);
                savedResult.set(new Intent().setData(FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", target)));
            });
            Intents.init();
            try {
                intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, savedResult.get()));
                evaluate(scenario, "window.__nativeSave='pending';Capacitor.Plugins.CircuitFiles.saveFile({content:'{\"实验\":1}',name:'实验.json'}).then(r=>window.__nativeSave=r.saved).catch(e=>window.__nativeSave=e.message);");
                awaitValue(scenario, "window.__nativeSave", "true");
                assertEquals("{\"实验\":1}", new String(Files.readAllBytes(file.get().toPath()), StandardCharsets.UTF_8));
            } finally {
                Intents.release();
            }
            Intents.init();
            try {
                intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null));
                evaluate(scenario, "window.__nativeSave='pending';Capacitor.Plugins.CircuitFiles.saveFile({content:'{}',name:'取消.json'}).then(r=>window.__nativeSave=r.saved);");
                awaitValue(scenario, "window.__nativeSave", "false");
            } finally {
                Intents.release();
            }
        }
    }
}
