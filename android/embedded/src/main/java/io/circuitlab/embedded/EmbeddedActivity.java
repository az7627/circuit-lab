package io.circuitlab.embedded;

import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import android.widget.Toast;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONObject;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.WebExtension;

public class EmbeddedActivity extends AppCompatActivity {
    private static GeckoRuntime runtime;
    private GeckoSession session;
    private WebExtension.Port webPort;
    private String appUrl;
    private boolean fullscreen;
    private JSONObject pendingSave;
    private WebExtension.Port savePort;
    private GeckoSession.PromptDelegate.FilePrompt pendingFile;
    private GeckoResult<GeckoSession.PromptDelegate.PromptResponse> fileResult;
    private final ActivityResultLauncher<Intent> saveDocument=registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),result->{
        if(pendingSave==null)return;
        try {
            boolean saved=result.getResultCode()==RESULT_OK&&result.getData()!=null&&result.getData().getData()!=null;
            if(saved)try(OutputStream stream=getContentResolver().openOutputStream(result.getData().getData(),"wt")){if(stream==null)throw new Exception("无法打开文件");stream.write(pendingSave.getString("content").getBytes(StandardCharsets.UTF_8));}
            reply(savePort,pendingSave,new JSONObject().put("saved",saved),null);
        }catch(Exception error){reply(savePort,pendingSave,null,error.getMessage());}
        pendingSave=null;savePort=null;
    });
    private final ActivityResultLauncher<Intent> openDocument=registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),result->{
        if(pendingFile==null)return;
        if(result.getResultCode()==RESULT_OK&&result.getData()!=null&&result.getData().getData()!=null)fileResult.complete(pendingFile.confirm(this,result.getData().getData()));
        else fileResult.complete(pendingFile.dismiss());
        pendingFile=null;fileResult=null;
    });
    private boolean smoke(){return BuildConfig.DEBUG&&getIntent().getBooleanExtra("circuitlab.smoke",false);}
    @Override public void onCreate(Bundle state){
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM);
        SplashScreen.installSplashScreen(this);super.onCreate(state);EdgeToEdge.enable(this);
        GeckoView view=new GeckoView(this);setContentView(view);
        ViewCompat.setOnApplyWindowInsetsListener(view,(v,insets)->{androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
        WindowCompat.getInsetsController(getWindow(),view).setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if(runtime==null)runtime=GeckoRuntime.create(this,new GeckoRuntimeSettings.Builder().preferredColorScheme(GeckoRuntimeSettings.COLOR_SCHEME_SYSTEM).build());
        session=new GeckoSession();
        session.setContentDelegate(new GeckoSession.ContentDelegate(){});
        session.setNavigationDelegate(new GeckoSession.NavigationDelegate(){
            @Override public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession current,LoadRequest request){return GeckoResult.fromValue(appUrl!=null&&request.uri.startsWith(appUrl)?AllowOrDeny.ALLOW:AllowOrDeny.DENY);}
        });
        session.setPromptDelegate(new GeckoSession.PromptDelegate(){
            @Override public GeckoResult<PromptResponse> onFilePrompt(GeckoSession current,FilePrompt prompt){
                if(pendingFile!=null)return GeckoResult.fromValue(prompt.dismiss());
                pendingFile=prompt;fileResult=new GeckoResult<>();
                openDocument.launch(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json"));return fileResult;
            }
        });
        session.open(runtime);view.setSession(session);
        runtime.getWebExtensionController().ensureBuiltIn("resource://android/assets/app/","workbench@circuitlab.local").accept(extension->{
            appUrl=extension.metaData.baseUrl+"app/";
            WebExtension.MessageDelegate messages=new WebExtension.MessageDelegate(){
                @Override public void onConnect(WebExtension.Port port){
                    if(!port.sender.url.startsWith(appUrl)||!port.sender.isTopLevel())return;
                    webPort=port;port.setDelegate(new WebExtension.PortDelegate(){
                        @Override public void onPortMessage(Object value,WebExtension.Port source){if(value instanceof JSONObject)handle(source,(JSONObject)value);}
                        @Override public void onDisconnect(WebExtension.Port source){if(webPort==source)webPort=null;}
                    });
                }
            };
            extension.setMessageDelegate(messages,"circuitlab");session.getWebExtensionController().setMessageDelegate(extension,messages,"circuitlab");
            session.loadUri(appUrl+"index.html");
        },error->Toast.makeText(this,"离线工作台加载失败："+error.getMessage(),Toast.LENGTH_LONG).show());
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){@Override public void handleOnBackPressed(){if(webPort==null){moveTaskToBack(true);return;}try{webPort.postMessage(new JSONObject().put("event","back"));}catch(Exception error){moveTaskToBack(true);}}});
    }
    private void reply(WebExtension.Port port,JSONObject request,Object result,String error){try{JSONObject response=new JSONObject().put("id",request.optInt("id"));if(error==null)response.put("result",result==null?new JSONObject():result);else response.put("error",error);if(port!=null)port.postMessage(response);}catch(Exception ignored){}}
    private void handle(WebExtension.Port port,JSONObject message){
        try{
            switch(message.optString("action")){
                case "environment":reply(port,message,new JSONObject().put("smoke",smoke()),null);break;
                case "barsVisible":WindowInsetsCompat insets=ViewCompat.getRootWindowInsets(getWindow().getDecorView());reply(port,message,new JSONObject().put("status",insets!=null&&insets.isVisible(WindowInsetsCompat.Type.statusBars())).put("navigation",insets!=null&&insets.isVisible(WindowInsetsCompat.Type.navigationBars())),null);break;
                case "hideBars":fullscreen=true;WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView()).hide(WindowInsetsCompat.Type.systemBars());reply(port,message,null,null);break;
                case "showBars":fullscreen=false;WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView()).show(WindowInsetsCompat.Type.systemBars());reply(port,message,null,null);break;
                case "barStyle":boolean light=!message.optString("style").equals("DARK");WindowInsetsControllerCompat controller=WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView());controller.setAppearanceLightStatusBars(light);controller.setAppearanceLightNavigationBars(light);reply(port,message,null,null);break;
                case "backResult":if(!message.optBoolean("handled"))moveTaskToBack(true);break;
                case "saveFile":
                    if(message.optString("content").length()>20*1024*1024)throw new Exception("实验文件过大");
                    if(pendingSave!=null)throw new Exception("请先完成当前保存");
                    if(smoke()){Files.write(new File(getFilesDir(),"smoke-export.json").toPath(),message.getString("content").getBytes(StandardCharsets.UTF_8));reply(port,message,new JSONObject().put("saved",true),null);break;}
                    pendingSave=message;savePort=port;
                    saveDocument.launch(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,new File(message.optString("name","实验.json")).getName()));break;
                case "smokeReport":if(!smoke())throw new Exception("未启用测试模式");Files.write(new File(getFilesDir(),"smoke-report.json").toPath(),message.getJSONObject("report").toString().getBytes(StandardCharsets.UTF_8));reply(port,message,null,null);break;
                default:throw new Exception("未知原生操作");
            }
        }catch(Exception error){reply(port,message,null,error.getMessage());}
    }
    @Override public void onConfigurationChanged(Configuration configuration){super.onConfigurationChanged(configuration);if(runtime!=null)runtime.getSettings().setPreferredColorScheme((configuration.uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES?GeckoRuntimeSettings.COLOR_SCHEME_DARK:GeckoRuntimeSettings.COLOR_SCHEME_LIGHT);}
    @Override public void onResume(){super.onResume();if(fullscreen)WindowCompat.getInsetsController(getWindow(),getWindow().getDecorView()).hide(WindowInsetsCompat.Type.systemBars());}
    @Override public void onDestroy(){if(session!=null)session.close();super.onDestroy();}
}
