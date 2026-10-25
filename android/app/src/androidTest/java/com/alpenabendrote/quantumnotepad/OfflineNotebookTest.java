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
}
