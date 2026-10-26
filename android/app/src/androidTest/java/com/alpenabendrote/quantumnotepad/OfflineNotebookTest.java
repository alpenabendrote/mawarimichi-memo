package com.alpenabendrote.quantumnotepad;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs with emulator Wi-Fi and mobile data disabled. Tests the real WebView and native plugins. */
@RunWith(AndroidJUnit4.class)
public class OfflineNotebookTest {
    private ActivityScenario<MainActivity> scenario;
    private String evaluate(String js) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> output = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(js, value -> { output.set(value); latch.countDown(); }));
        assertTrue("JavaScript callback timed out", latch.await(10, TimeUnit.SECONDS));
        return output.get();
    }
    private void eventually(String js) throws Exception {
        long end = System.currentTimeMillis() + 20000;
        do { if ("true".equals(evaluate(js))) return; Thread.sleep(100); } while (System.currentTimeMillis() < end);
        fail("WebView assertion did not become true: " + js);
    }
    @Test public void noInternetPermissionOrEmojiDownloadAndLicensesAreAvailableOffline() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals(android.content.pm.PackageManager.PERMISSION_DENIED,
            context.checkSelfPermission(android.Manifest.permission.INTERNET));
        android.content.pm.ProviderInfo provider = context.getPackageManager().getProviderInfo(
            new android.content.ComponentName(context, "androidx.startup.InitializationProvider"),
            android.content.pm.PackageManager.GET_META_DATA);
        assertTrue(provider.metaData == null ||
            !provider.metaData.containsKey("androidx.emoji2.text.EmojiCompatInitializer"));
        try (java.io.InputStream stream = context.getAssets().open("native-third-party-notices.txt")) {
            String notices = new String(stream.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertTrue(notices.contains("org.apache.cordova:framework:14.0.1"));
            assertTrue(notices.contains("Apache Cordova"));
            assertTrue(notices.contains("The Apache Software Foundation"));
            assertTrue(notices.contains("io.ionic.libs:ionfilesystem-android:1.1.1"));
            assertTrue(notices.contains("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION"));
            assertTrue(notices.contains("Meta Platforms"));
        }
        scenario = ActivityScenario.launch(MainActivity.class);
        try {
            eventually("!!document.querySelector('.note-title')");
            evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='ヘルプ').click()");
            eventually("!!document.querySelector('.license-details')");
            evaluate("document.querySelector('.license-details > summary').click()");
            assertEquals("true", evaluate("document.querySelector('.license-details').open"));
            assertEquals("true", evaluate("document.querySelector('.license-details').textContent.includes('Copyright (c) 2026 alpenabendrote')"));
            assertEquals("true", evaluate("document.querySelector('.license-details').textContent.includes('Meta Platforms')"));
            assertEquals("true", evaluate("document.querySelector('.license-details').textContent.includes('The Apache Software Foundation')"));
        } finally { scenario.close(); }
    }

    @Test public void offlineEditingWorkersAndNativeStorageSurviveActivityRecreation() throws Exception {
        InstrumentationRegistry.getInstrumentation().getTargetContext().getSharedPreferences("CapacitorStorage", 0).edit().clear().commit();
        scenario = ActivityScenario.launch(MainActivity.class);
        try {
            eventually("!!document.querySelector('.note-title')");
            evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='量子検索').click()");
            eventually("!!document.querySelector('textarea')");
            assertEquals("true", evaluate("window.isSecureContext && typeof crypto.randomUUID === 'function'"));
            evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='新規').click()");
            eventually("!!document.querySelector('textarea')");
            evaluate("(()=>{const e=document.querySelector('.note-title');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Android offline test');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
            // The actual paste handler must run the real bundled teleportation worker before insertion.
            evaluate("(()=>{const e=document.querySelector('textarea');e.focus();e.setSelectionRange(0,0);const d=new DataTransfer();d.setData('text/plain','Android 量子貼付');e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}));})()");
            eventually("document.querySelector('textarea')?.value === 'Android 量子貼付'");
            eventually("document.querySelector('.note-toolbar')?.textContent.includes('自動保存')");
            scenario.recreate();
            eventually("document.querySelector('.note-title')?.value === 'Android offline test'");
            assertEquals("true", evaluate("!document.querySelector('textarea')"));
            evaluate("(()=>{const e=document.querySelector('.note-title');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'updated after restart');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
            eventually("document.querySelector('.note-toolbar')?.textContent.includes('自動保存')");
            String saved = InstrumentationRegistry.getInstrumentation().getTargetContext().getSharedPreferences("CapacitorStorage", 0).getString("quantum-notepad.notes.v1", "");
            assertTrue("Native storage should contain the reconstructed text", saved.contains("Android 量子貼付"));
            assertTrue(saved.contains("updated after restart"));
            assertFalse(saved.contains("未保存"));
            // Delete through the real damping worker, retain the open circuit, then restore the exact note.
            evaluate("document.querySelector('.cooling-details > summary').click()");
            evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='削除').click()");
            eventually("document.querySelector('.cooling-details')?.textContent.includes('消去完了')");
            assertEquals("true", evaluate("document.querySelector('.cooling-details').open"));
            eventually("!document.querySelector('.note-list')?.textContent.includes('updated after restart')");
            eventually("document.querySelector('.note-toolbar')?.textContent.includes('自動保存')");
            String afterDeletion = InstrumentationRegistry.getInstrumentation().getTargetContext().getSharedPreferences("CapacitorStorage", 0).getString("quantum-notepad.notes.v1", "");
            assertFalse(afterDeletion.contains("updated after restart"));
            evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='元に戻す').click()");
            eventually("document.querySelector('.note-title')?.value === 'updated after restart'");
            eventually("document.querySelector('.note-toolbar')?.textContent.includes('自動保存')");
            String restored = InstrumentationRegistry.getInstrumentation().getTargetContext().getSharedPreferences("CapacitorStorage", 0).getString("quantum-notepad.notes.v1", "");
            assertTrue(restored.contains("Android 量子貼付"));
            assertTrue(restored.contains("updated after restart"));
        } finally { scenario.close(); }
    }

    @Test public void offlineSedimentWorkerSavesSurvivingStatesAndRestoresOnRecreation() throws Exception {
        org.json.JSONArray notes = new org.json.JSONArray();
        for (int i = 0; i < 32; i++) {
            org.json.JSONObject note = new org.json.JSONObject();
            note.put("id", "sediment-" + i);
            note.put("title", i == 0 ? "保護しているメモ" : "古いメモ " + i);
            note.put("body", "元の本文🪐 [" + i + "]");
            note.put("updatedAt", i == 0 ? java.time.Instant.now().toString() : java.time.Instant.now().minus(java.time.Duration.ofDays(8)).toString());
            notes.put(note);
        }
        android.content.SharedPreferences prefs = InstrumentationRegistry.getInstrumentation().getTargetContext().getSharedPreferences("CapacitorStorage", 0);
        prefs.edit().clear().putString("quantum-notepad.notes.v1", notes.toString()).commit();
        scenario = ActivityScenario.launch(MainActivity.class);
        try {
            eventually("document.querySelector('.sediment-status')?.textContent.includes('回測定')");
            assertEquals("true", evaluate("document.querySelector('.note-title')?.value === '保護しているメモ'"));
            String raw = "";
            long deadline = System.currentTimeMillis() + 10000;
            do {
                raw = prefs.getString("quantum-notepad.notes.v1", "");
                if (raw.contains("\"sedimentWalk\"") || raw.contains("\"sediment\"")) break;
                Thread.sleep(100);
            } while (System.currentTimeMillis() < deadline);
            org.json.JSONArray saved = new org.json.JSONArray(raw);
            assertTrue(saved.length() <= 32);
            String all = saved.toString();
            // Every original body is still in its source note or in the combined archive.
            for (int i = 0; i < 32; i++) assertTrue("Missing original body " + i, all.contains("元の本文🪐 [" + i + "]"));
            assertTrue(all.contains("\"sedimentWalk\"") || all.contains("\"sediment\""));
            String lastMeasurement = evaluate("document.querySelector('.sediment-status').textContent");
            evaluate("window.dispatchEvent(new Event('focus'))");
            eventually("document.querySelector('.sediment-status')?.textContent.includes('回測定')");
            assertEquals("A preparation-only check must retain the last measured circuit", lastMeasurement, evaluate("document.querySelector('.sediment-status').textContent"));
            scenario.recreate();
            eventually("document.querySelector('.note-title')?.value === '保護しているメモ'");
            assertEquals("true", evaluate("!document.querySelector('textarea')"));
        } finally { scenario.close(); }
    }

    @Test public void longSedimentBodyKeepsAllTextAndCountsCharactersOffline() throws Exception {
        org.json.JSONObject note = new org.json.JSONObject();
        note.put("id", "long-archive"); note.put("title", "堆積");
        note.put("body", new String(new char[210000]).replace('\0', '長') + "🪐");
        note.put("updatedAt", java.time.Instant.now().toString());
        note.put("sediment", new org.json.JSONObject().put("total", 1).put("history", new org.json.JSONArray()));
        InstrumentationRegistry.getInstrumentation().getTargetContext().getSharedPreferences("CapacitorStorage", 0).edit().clear().putString("quantum-notepad.notes.v1", new org.json.JSONArray().put(note).toString()).commit();
        scenario = ActivityScenario.launch(MainActivity.class);
        try {
            eventually("document.querySelector('.note-title')?.value === '堆積'");
            evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='量子検索').click()");
            eventually("document.querySelector('textarea')?.value.length === 210002");
            assertEquals("true", evaluate("document.querySelector('textarea').maxLength === -1"));
            assertEquals("true", evaluate("document.querySelector('.editor-footer')?.textContent.includes((210001).toLocaleString())"));
        } finally { scenario.close(); }
    }
}
