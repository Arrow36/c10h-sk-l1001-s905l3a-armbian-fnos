package com.arrow36.c10h.reboot;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;

public class MainActivity extends Activity {
    private static final String TAG = "RebootToFnOS";
    private Button btnReboot;
    private TextView tvStatus;
    private Handler mainHandler;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        mainHandler = new Handler(Looper.getMainLooper());
        btnReboot = findViewById(R.id.btnReboot);
        tvStatus = findViewById(R.id.tvStatus);

        btnReboot.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                btnReboot.setEnabled(false);
                btnReboot.setText("正在触发重启...");
                tvStatus.setText("正在下发系统重启指令...");
                doRebootToFnOS();
            }
        });
    }

    private void updateStatus(final String msg) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                tvStatus.setText(msg);
            }
        });
    }

    private void doRebootToFnOS() {
        Toast.makeText(this, "正在重启到飞牛 fnOS...", Toast.LENGTH_SHORT).show();
        new Thread(new Runnable() {
            @Override
            public void run() {
                File scriptFile = prepareScript();
                String scriptPath = (scriptFile != null) ? scriptFile.getAbsolutePath() : "/data/local/boot_fnos.sh";

                // 机制 1: 内置 root 服务 telecom_shell (init 根进程拉起)
                try {
                    Log.i(TAG, "Method 1: telecom_shell trigger -> " + scriptPath);
                    setSystemProp("sys.sky.ctcc.shell_1", scriptPath);
                    setSystemProp("ctl.start", "telecom_shell");
                    updateStatus("已通过系统服务触发引导重启...");
                    Thread.sleep(400);
                } catch (Throwable t) {
                    Log.e(TAG, "telecom_shell trigger failed", t);
                }

                // 机制 2: sys.powerctl reboot,update
                try {
                    Log.i(TAG, "Method 2: sys.powerctl property");
                    setSystemProp("sys.powerctl", "reboot,update");
                    updateStatus("已下发 sys.powerctl 指令...");
                    Thread.sleep(300);
                } catch (Throwable t) {
                    Log.e(TAG, "sys.powerctl failed", t);
                }

                // 机制 3: /system/bin/reboot update
                try {
                    Log.i(TAG, "Method 3: /system/bin/reboot update");
                    Process p = Runtime.getRuntime().exec(new String[]{"/system/bin/reboot", "update"});
                    p.waitFor();
                    updateStatus("已调用 /system/bin/reboot update...");
                } catch (Throwable t) {
                    Log.e(TAG, "/system/bin/reboot failed", t);
                }

                // 机制 4: su (若提权环境可用)
                try {
                    Log.i(TAG, "Method 4: su -c reboot update");
                    Process p = Runtime.getRuntime().exec(new String[]{"su", "-c", "reboot update"});
                    p.waitFor();
                } catch (Throwable t) {
                    Log.e(TAG, "su failed", t);
                }

                // 机制 5: PowerManager
                try {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        pm.reboot("update");
                    }
                } catch (Throwable t) {
                    Log.e(TAG, "pm.reboot failed", t);
                }

                updateStatus("重启指令已下发！设备正在关机并进入飞牛 fnOS...");
            }
        }).start();
    }

    private File prepareScript() {
        File f1 = new File("/data/local/boot_fnos.sh");
        if (f1.exists() && f1.canExecute()) {
            return f1;
        }

        try {
            FileOutputStream fos = new FileOutputStream(f1);
            fos.write("#!/system/bin/sh\nsync\n/system/bin/reboot update\n".getBytes());
            fos.flush();
            fos.close();
            f1.setExecutable(true, false);
            f1.setReadable(true, false);
            return f1;
        } catch (Throwable ignored) {}

        try {
            File f2 = new File(getFilesDir(), "boot_fnos.sh");
            FileOutputStream fos = new FileOutputStream(f2);
            fos.write("#!/system/bin/sh\nsync\n/system/bin/reboot update\n".getBytes());
            fos.flush();
            fos.close();
            f2.setExecutable(true, false);
            f2.setReadable(true, false);
            return f2;
        } catch (Throwable ignored) {}

        return null;
    }

    private void setSystemProp(String key, String val) {
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"/system/bin/setprop", key, val});
            p.waitFor();
        } catch (Throwable t) {
            Log.e(TAG, "exec setprop failed", t);
        }

        try {
            Class<?> spClass = Class.forName("android.os.SystemProperties");
            Method setMethod = spClass.getMethod("set", String.class, String.class);
            setMethod.invoke(null, key, val);
        } catch (Throwable t) {
            Log.e(TAG, "reflection setprop failed", t);
        }
    }
}