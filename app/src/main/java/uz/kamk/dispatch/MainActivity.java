package uz.kamk.dispatch;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.webkit.WebViewAssetLoader;

public final class MainActivity extends Activity {
    private static final int REQUEST_MICROPHONE = 803;
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_PAGE = APP_ORIGIN + "/assets/web/index.html";

    private WebView webView;
    private PermissionRequest pendingWebPermission;
    private WebViewAssetLoader assetLoader;
    private android.content.SharedPreferences preferences;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences("kamk_realtime_settings", MODE_PRIVATE);
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setBackgroundColor(android.graphics.Color.rgb(9, 15, 22));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " KAMKDispatcher/0.2.0");

        webView.addJavascriptInterface(new NativeBridge(), "KAMKNative");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermission == request) pendingWebPermission = null;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority())) {
                    WebResourceResponse response = assetLoader.shouldInterceptRequest(uri);
                    if (response != null) return response;
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadDataWithBaseURL(APP_ORIGIN,
                            "<html><body style='background:#09101a;color:#fff;font-family:sans-serif;padding:28px'>"
                                    + "<h2>KAMK Dispetcher</h2><p>Ilova interfeysini yuklab bo'lmadi.</p></body></html>",
                            "text/html", "UTF-8", null);
                }
            }
        });

        setContentView(webView);
        webView.loadUrl(START_PAGE);
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        boolean asksAudio = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) asksAudio = true;
            else {
                request.deny();
                return;
            }
        }
        if (!asksAudio) {
            request.deny();
            return;
        }

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            if (pendingWebPermission != null) pendingWebPermission.deny();
            pendingWebPermission = request;
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_MICROPHONE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_MICROPHONE) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (pendingWebPermission != null) {
                if (granted) pendingWebPermission.grant(
                        new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                else pendingWebPermission.deny();
                pendingWebPermission = null;
            }
            if (!granted) Toast.makeText(this,
                    "Jonli suhbat uchun mikrofon ruxsati kerak.", Toast.LENGTH_LONG).show();
        }
    }

    public final class NativeBridge {
        @JavascriptInterface
        public String getBackendUrl() {
            return preferences.getString("backend_url", "");
        }

        @JavascriptInterface
        public void setBackendUrl(String value) {
            String url = value == null ? "" : value.trim();
            if (!url.isEmpty() && !(url.startsWith("https://")
                    || url.startsWith("http://10.0.2.2") || url.startsWith("http://localhost"))) {
                return;
            }
            preferences.edit().putString("backend_url", url.replaceAll("/+$", "")).apply();
        }

        @JavascriptInterface
        public String getAccessToken() {
            return preferences.getString("access_token", "");
        }

        @JavascriptInterface
        public void setAccessToken(String value) {
            preferences.edit().putString("access_token", value == null ? "" : value).apply();
        }

        @JavascriptInterface
        public void clearAccessToken() {
            preferences.edit().remove("access_token").apply();
        }

        @JavascriptInterface
        public void notifyUser(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this,
                    message == null ? "" : message, Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (pendingWebPermission != null) {
            pendingWebPermission.deny();
            pendingWebPermission = null;
        }
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.removeJavascriptInterface("KAMKNative");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
