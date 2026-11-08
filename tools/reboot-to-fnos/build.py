import os
import sys
import shutil
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
BUILD_DIR = BASE_DIR / "build"
if BUILD_DIR.exists():
    shutil.rmtree(BUILD_DIR)
BUILD_DIR.mkdir(parents=True)

# 默认工具路径（可根据实际系统配置环境变量覆盖）
AAPT2 = os.environ.get("AAPT2", "aapt2")
ANDROID_JAR = os.environ.get("ANDROID_JAR", "android.jar")
R8_JAR = os.environ.get("R8_JAR", "r8.jar")
KEYSTORE = os.environ.get("KEYSTORE", "debug.jks")

JAVAC = os.environ.get("JAVAC", "javac")
JAVA = os.environ.get("JAVA", "java")
JARSIGNER = os.environ.get("JARSIGNER", "jarsigner")

print(">>> Step 1: Compiling resources with AAPT2...")
res_zip = BUILD_DIR / "resources.zip"
cmd_compile = [AAPT2, "compile", "--dir", str(BASE_DIR / "res"), "-o", str(res_zip)]
subprocess.check_call(cmd_compile)

print(">>> Step 2: Linking resources with AAPT2...")
gen_dir = BUILD_DIR / "gen"
gen_dir.mkdir(parents=True)
unaligned_apk = BUILD_DIR / "unaligned.apk"
cmd_link = [
    AAPT2, "link",
    "-I", ANDROID_JAR,
    "--manifest", str(BASE_DIR / "AndroidManifest.xml"),
    "--java", str(gen_dir),
    "-o", str(unaligned_apk),
    "--auto-add-overlay",
    str(res_zip)
]
subprocess.check_call(cmd_link)

print(">>> Step 3: Compiling Java source code...")
classes_dir = BUILD_DIR / "classes"
classes_dir.mkdir(parents=True)

java_files = list((BASE_DIR / "src").rglob("*.java")) + list(gen_dir.rglob("*.java"))
cmd_javac = [
    JAVAC,
    "-encoding", "UTF-8",
    "-source", "1.8",
    "-target", "1.8",
    "-cp", ANDROID_JAR,
    "-d", str(classes_dir)
] + [str(f) for f in java_files]
subprocess.check_call(cmd_javac)

print(">>> Step 4: D8 / R8 compiling bytecode to classes.dex...")
class_files = list(classes_dir.rglob("*.class"))
cmd_d8 = [
    JAVA, "-cp", R8_JAR,
    "com.android.tools.r8.D8",
    "--min-api", "24",
    "--output", str(BUILD_DIR)
] + [str(f) for f in class_files]
subprocess.check_call(cmd_d8)

print(">>> Step 5: Adding classes.dex to APK...")
import zipfile
with zipfile.ZipFile(unaligned_apk, "a") as z:
    z.write(BUILD_DIR / "classes.dex", "classes.dex")

print(">>> Step 6: Signing APK...")
final_apk = BASE_DIR / "RebootToFnOS.apk"
shutil.copy2(unaligned_apk, final_apk)

cmd_sign = [
    JARSIGNER,
    "-keystore", KEYSTORE,
    "-storepass", "android",
    "-keypass", "android",
    "-digestalg", "SHA-256",
    "-sigalg", "SHA256withRSA",
    str(final_apk),
    "androiddebugkey"
]
subprocess.check_call(cmd_sign)

print(">>> Build Success! Output:", final_apk)
