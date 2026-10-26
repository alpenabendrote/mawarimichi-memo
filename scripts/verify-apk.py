"""Check the actual release APK rather than just the source manifest."""
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile

apk_path, manifest_path = sys.argv[1:]
manifest = ET.parse(manifest_path).getroot()
android = "{http://schemas.android.com/apk/res/android}"
assert all(node.get(android + "name") != "android.permission.INTERNET"
           for node in manifest.findall("uses-permission")), "INTERNET permission remains"
application = manifest.find("application")
assert application is not None
assert application.get(android + "debuggable", "false") == "false", "Release build is debuggable"
assert all(node.get(android + "name") != "androidx.emoji2.text.EmojiCompatInitializer"
           for node in application.iter("meta-data")), "Emoji font initializer remains"
with ZipFile(apk_path) as apk:
    for name in ["assets/public/LICENSE", "assets/public/THIRD_PARTY_NOTICES.txt",
                 "assets/native-third-party-notices.txt"]:
        text = apk.read(name).decode("utf-8")
        assert "Permission is hereby granted" in text, name
    native = apk.read("assets/native-third-party-notices.txt").decode("utf-8")
    for expected in ["org.apache.cordova:framework:14.0.1", "The Apache Software Foundation",
                     "Meta Platforms", "io.ionic.libs:ionfilesystem-android:1.1.1",
                     "TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION"]:
        assert expected in native, expected
print("Release APK: no INTERNET permission, no emoji initializer, debugging disabled, licenses included.")
