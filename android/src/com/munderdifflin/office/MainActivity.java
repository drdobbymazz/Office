package com.munderdifflin.office;

import android.app.Activity;
import android.content.Intent;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * The whole app: one full-screen, landscape web view running the game.
 *
 * The game's files ship inside the app (assets/www) and are served as if from
 * http://localhost. That origin matters: Ollama accepts requests from localhost
 * pages by default, so the game can talk to the laptop on the home network with
 * no setting changed there. Anything not on localhost goes out to the network
 * as usual.
 */
public class MainActivity extends Activity {
    private static final String TAG = "MunderDifflin";
    private static final String HOME = "http://localhost/index.html";

    private WebView web;
    private FrameLayout root;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Lets chrome://inspect on a computer look inside the game over USB debugging.
        WebView.setWebContentsDebuggingEnabled(true);

        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF1A1320);
        web = new WebView(this);
        web.setBackgroundColor(0xFF1A1320);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        // Pixel text must not grow with the phone's font size setting.
        s.setTextZoom(100);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.setWebViewClient(new LocalFiles(getAssets()));
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                // adb logcat -s MunderDifflin
                Log.i(TAG, m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // The keyboard: shrink the game above it, so what is being typed stays in view.
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                int bottom = in.getSystemWindowInsetBottom();
                int height = v.getRootView().getHeight();
                // Only something as tall as a keyboard counts: a navigation bar that flicks up briefly does not.
                int keyboard = bottom > height * 0.2f ? bottom : 0;
                FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams();
                if (lp.bottomMargin != keyboard) {
                    lp.bottomMargin = keyboard;
                    web.setLayoutParams(lp);
                    if (keyboard == 0) v.post(new Runnable() { public void run() { hideBars(); } });
                }
                return in.consumeSystemWindowInsets();
            }
        });

        hideBars();
        web.loadUrl(HOME);
    }

    /** Full screen: no status bar, no navigation bar. A swipe from the edge shows them for a moment. */
    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    @Override
    protected void onPause() {
        // The game saves when the page goes away; tell it now, in case Android closes the app later.
        web.evaluateJavascript("window.dispatchEvent(new Event('pagehide'))", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideBars();
    }

    /** Back leaves the game running in the background instead of closing it. */
    @Override
    public void onBackPressed() {
        moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Serves assets/www as http://localhost/; leaves every other address to the network. */
    private static final class LocalFiles extends WebViewClient {
        private static final Map<String, String> TYPES = new HashMap<String, String>();
        static {
            TYPES.put("html", "text/html");
            TYPES.put("js", "text/javascript");
            TYPES.put("mjs", "text/javascript");
            TYPES.put("css", "text/css");
            TYPES.put("json", "application/json");
            TYPES.put("webmanifest", "application/manifest+json");
            TYPES.put("png", "image/png");
            TYPES.put("jpg", "image/jpeg");
            TYPES.put("svg", "image/svg+xml");
            TYPES.put("ico", "image/x-icon");
            TYPES.put("woff", "font/woff");
            TYPES.put("woff2", "font/woff2");
            TYPES.put("ttf", "font/ttf");
            TYPES.put("wasm", "application/wasm");
            TYPES.put("txt", "text/plain");
        }

        private final AssetManager assets;

        LocalFiles(AssetManager assets) {
            this.assets = assets;
        }

        private static boolean isLocal(Uri u) {
            return "http".equals(u.getScheme()) && "localhost".equals(u.getHost()) && (u.getPort() == -1 || u.getPort() == 80);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (!isLocal(u)) return null;
            String path = u.getPath();
            if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
            if (path.contains("..")) return notFound();
            int dot = path.lastIndexOf('.');
            String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase() : "";
            String type = TYPES.containsKey(ext) ? TYPES.get(ext) : "application/octet-stream";
            boolean text = type.startsWith("text/") || type.endsWith("json") || type.endsWith("+xml") || type.equals("image/svg+xml");
            try {
                InputStream in = assets.open("www" + path);
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Cache-Control", "no-cache");
                return new WebResourceResponse(type, text ? "utf-8" : null, 200, "OK", headers, in);
            } catch (IOException e) {
                return notFound();
            }
        }

        private static WebResourceResponse notFound() {
            Map<String, String> headers = new HashMap<String, String>();
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
        }

        /**
         * Links to other sites open in the browser, not inside the game. (Android 7 and later call this;
         * it is missing from the Android 6 library the app is compiled against, hence no @Override.)
         */
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (isLocal(u)) return false;
            try {
                view.getContext().startActivity(new Intent(Intent.ACTION_VIEW, u));
            } catch (Exception e) {
                Log.w(TAG, "No app to open " + u);
            }
            return true;
        }
    }
}
