import sys
import os
import paramiko

def get_ssh_client():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    for ip in ['192.168.5.30', '192.168.137.50']:
        try:
            ssh.connect(ip, port=22, username='root', password='1234', timeout=3)
            return ssh
        except Exception:
            continue
    print("Failed to connect to both 192.168.5.30 and 192.168.137.50", file=sys.stderr)
    sys.exit(1)

def run_remote(cmd):
    ssh = get_ssh_client()
    full_cmd = f"env PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin bash -c {repr(cmd)}"
    stdin, stdout, stderr = ssh.exec_command(full_cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    ssh.close()
    if out:
        print(out, end='')
    clean_err = "\n".join([line for line in err.splitlines() if "password" not in line.lower() and "[sudo]" not in line])
    if clean_err:
        print("STDERR:\n", clean_err, file=sys.stderr)

def put_file(local_path, remote_path):
    ssh = get_ssh_client()
    sftp = ssh.open_sftp()
    sftp.put(local_path, remote_path)
    sftp.close()
    ssh.close()
    print(f"Uploaded {local_path} -> {remote_path}")

def get_file(remote_path, local_path):
    ssh = get_ssh_client()
    sftp = ssh.open_sftp()
    sftp.get(remote_path, local_path)
    sftp.close()
    ssh.close()
    print(f"Downloaded {remote_path} -> {local_path}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        if sys.argv[1] == '-put' and len(sys.argv) == 4:
            put_file(sys.argv[2], sys.argv[3])
        elif sys.argv[1] == '-get' and len(sys.argv) == 4:
            get_file(sys.argv[2], sys.argv[3])
        else:
            run_remote(sys.argv[1])
