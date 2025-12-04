---
title: Ansible Guide
slug: ansible-guide
summary: "1. [Overview](#overview)"
status: stable
stability: production
owner: docs
lastUpdated: "2025-11-27"
audience:
  - frontend
  - ai-agents
tags:
  - ansible
  - guide
category: operations
ai_summary: >-
  1. Overview 2. Playbook Structure 3. Role Documentation 4. Inventory
  Management 5. Variables and Secrets 6. Running Playbooks 7. HIPAA Compliance
  Configuration 8. Best Practices 9. Troubleshooting Ansible is used to
  configure and maintain VoiceAssist servers after they've been provisioned by
  Terr...
---

# Ansible Guide

## Table of Contents

1. [Overview](#overview)
2. [Playbook Structure](#playbook-structure)
3. [Role Documentation](#role-documentation)
4. [Inventory Management](#inventory-management)
5. [Variables and Secrets](#variables-and-secrets)
6. [Running Playbooks](#running-playbooks)
7. [HIPAA Compliance Configuration](#hipaa-compliance-configuration)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

## Overview

Ansible is used to configure and maintain VoiceAssist servers after they've been provisioned by Terraform. It handles OS hardening, software installation, and HIPAA compliance configuration.

### Key Features

- **Idempotent**: Safe to run multiple times
- **Agentless**: No software to install on target hosts
- **HIPAA Compliant**: Security hardening and audit logging
- **Role-Based**: Modular, reusable configuration
- **Multi-Environment**: Separate inventory for each environment

### Ansible Version

```bash
ansible --version
# ansible [core 2.15.0] or higher
```

## Playbook Structure

### Main Playbook

The main playbook (`site.yml`) orchestrates all configuration:

```yaml
---
- name: Configure VoiceAssist Infrastructure
  hosts: all
  become: yes
  gather_facts: yes

  pre_tasks:
    - name: Update apt cache
      ansible.builtin.apt:
        update_cache: yes
        cache_valid_time: 3600

  roles:
    - role: common
      tags: [common, base]

    - role: security
      tags: [security, hardening]

    - role: docker
      tags: [docker, container]
      when: "'docker_hosts' in group_names"

    - role: kubernetes
      tags: [kubernetes, k8s]
      when: "'k8s_nodes' in group_names"

    - role: monitoring
      tags: [monitoring, observability]
```

### Directory Structure

```
infrastructure/ansible/
├── ansible.cfg                 # Ansible configuration
├── site.yml                    # Main playbook
│
├── inventories/               # Environment inventories
│   ├── dev/
│   │   ├── hosts.yml         # Development hosts
│   │   └── group_vars/
│   │       ├── all.yml       # Variables for all hosts
│   │       └── docker_hosts.yml
│   │
│   ├── staging/
│   │   ├── hosts.yml
│   │   └── group_vars/
│   │
│   └── production/
│       ├── hosts.yml
│       └── group_vars/
│
├── playbooks/                 # Specific task playbooks
│   ├── update_packages.yml
│   ├── rotate_credentials.yml
│   └── emergency_patch.yml
│
└── roles/                     # Ansible roles
    ├── common/               # Base system configuration
    │   ├── tasks/
    │   │   └── main.yml
    │   ├── handlers/
    │   │   └── main.yml
    │   ├── files/
    │   ├── templates/
    │   └── defaults/
    │       └── main.yml
    │
    ├── security/             # Security hardening
    │   ├── tasks/
    │   ├── handlers/
    │   ├── templates/
    │   └── defaults/
    │
    ├── docker/               # Docker installation
    │   ├── tasks/
    │   ├── handlers/
    │   └── defaults/
    │
    ├── kubernetes/           # Kubernetes tools
    │   ├── tasks/
    │   ├── handlers/
    │   └── defaults/
    │
    └── monitoring/           # Monitoring agents
        ├── tasks/
        ├── handlers/
        ├── templates/
        └── defaults/
```

## Role Documentation

### Common Role

Performs base system configuration for all servers.

**Tasks:**

- Update and upgrade system packages
- Configure timezone and NTP
- Create system users and groups
- Set up basic directory structure
- Configure system limits
- Install essential utilities

**Files:**

```
roles/common/
├── tasks/
│   └── main.yml
├── handlers/
│   └── main.yml
└── defaults/
    └── main.yml
```

**Key Tasks** (`tasks/main.yml`):

```yaml
---
- name: Update apt cache
  ansible.builtin.apt:
    update_cache: yes
    cache_valid_time: 3600

- name: Upgrade all packages
  ansible.builtin.apt:
    upgrade: dist
    autoclean: yes
    autoremove: yes

- name: Install essential packages
  ansible.builtin.apt:
    name:
      - curl
      - wget
      - git
      - vim
      - htop
      - net-tools
      - ca-certificates
      - gnupg
      - lsb-release
    state: present

- name: Set timezone
  community.general.timezone:
    name: "{{ system_timezone | default('UTC') }}"

- name: Configure NTP
  ansible.builtin.apt:
    name: chrony
    state: present

- name: Create application user
  ansible.builtin.user:
    name: voiceassist
    shell: /bin/bash
    create_home: yes
    groups: sudo
    append: yes
```

**Variables** (`defaults/main.yml`):

```yaml
---
system_timezone: UTC
app_user: voiceassist
app_group: voiceassist
app_home: /opt/voiceassist
```

### Security Role

Implements security hardening and HIPAA compliance requirements.

**Tasks:**

- Configure UFW firewall
- Install and configure fail2ban
- Harden SSH configuration
- Set up audit logging (auditd)
- Configure automatic security updates
- Implement file integrity monitoring
- Set password policies
- Configure log rotation

**Key Tasks** (`tasks/main.yml`):

```yaml
---
- name: Install security packages
  ansible.builtin.apt:
    name:
      - ufw
      - fail2ban
      - auditd
      - audispd-plugins
      - aide
      - unattended-upgrades
      - libpam-pwquality
    state: present

- name: Configure UFW firewall
  community.general.ufw:
    rule: allow
    port: "{{ item }}"
    proto: tcp
  loop:
    - "22" # SSH
    - "80" # HTTP
    - "443" # HTTPS

- name: Enable UFW
  community.general.ufw:
    state: enabled
    policy: deny

- name: Harden SSH configuration
  ansible.builtin.lineinfile:
    path: /etc/ssh/sshd_config
    regexp: "{{ item.regexp }}"
    line: "{{ item.line }}"
  loop:
    - { regexp: "^#?PermitRootLogin", line: "PermitRootLogin no" }
    - { regexp: "^#?PasswordAuthentication", line: "PasswordAuthentication no" }
    - { regexp: "^#?PubkeyAuthentication", line: "PubkeyAuthentication yes" }
    - { regexp: "^#?X11Forwarding", line: "X11Forwarding no" }
    - { regexp: "^#?MaxAuthTries", line: "MaxAuthTries 3" }
    - { regexp: "^#?Protocol", line: "Protocol 2" }
  notify: restart sshd

- name: Configure fail2ban
  ansible.builtin.template:
    src: fail2ban-jail.local.j2
    dest: /etc/fail2ban/jail.local
    mode: "0644"
  notify: restart fail2ban

- name: Configure auditd rules for HIPAA
  ansible.builtin.template:
    src: audit-rules.j2
    dest: /etc/audit/rules.d/voiceassist.rules
    mode: "0640"
  notify: restart auditd

- name: Enable automatic security updates
  ansible.builtin.template:
    src: 50unattended-upgrades.j2
    dest: /etc/apt/apt.conf.d/50unattended-upgrades
    mode: "0644"
```

**HIPAA Audit Rules** (`templates/audit-rules.j2`):

```bash
# VoiceAssist HIPAA Audit Rules

# Audit access to PHI directories
-w /opt/voiceassist/data -p wa -k phi_access

# Audit user and group modifications
-w /etc/passwd -p wa -k user_modification
-w /etc/group -p wa -k group_modification
-w /etc/shadow -p wa -k shadow_modification

# Audit sudo usage
-w /etc/sudoers -p wa -k sudoers_changes
-w /etc/sudoers.d/ -p wa -k sudoers_changes

# Audit authentication events
-w /var/log/auth.log -p wa -k auth_log

# Audit network configuration changes
-w /etc/network/ -p wa -k network_config
-w /etc/hosts -p wa -k hosts_file

# Audit kernel module loading
-w /sbin/insmod -p x -k modules
-w /sbin/rmmod -p x -k modules
-w /sbin/modprobe -p x -k modules

# Audit file deletions
-a always,exit -F arch=b64 -S unlink -S unlinkat -S rename -S renameat -k delete
```

**Variables** (`defaults/main.yml`):

```yaml
---
# Firewall ports
firewall_allowed_ports:
  - 22 # SSH
  - 80 # HTTP
  - 443 # HTTPS
  - 6443 # Kubernetes API

# fail2ban settings
fail2ban_maxretry: 3
fail2ban_bantime: 3600
fail2ban_findtime: 600

# SSH hardening
ssh_port: 22
ssh_permit_root_login: no
ssh_password_authentication: no

# Audit log rotation
audit_log_retention_days: 90
```

### Docker Role

Installs and configures Docker for container workloads.

**Tasks:**

- Install Docker CE
- Configure Docker daemon
- Set up Docker logging
- Add users to docker group
- Configure Docker registry credentials
- Set resource limits

**Key Tasks** (`tasks/main.yml`):

```yaml
---
- name: Install Docker dependencies
  ansible.builtin.apt:
    name:
      - apt-transport-https
      - ca-certificates
      - curl
      - gnupg
      - lsb-release
    state: present

- name: Add Docker GPG key
  ansible.builtin.apt_key:
    url: https://download.docker.com/linux/ubuntu/gpg
    state: present

- name: Add Docker repository
  ansible.builtin.apt_repository:
    repo: "deb [arch=amd64] https://download.docker.com/linux/ubuntu {{ ansible_distribution_release }} stable"
    state: present

- name: Install Docker
  ansible.builtin.apt:
    name:
      - docker-ce
      - docker-ce-cli
      - containerd.io
      - docker-compose-plugin
    state: present
    update_cache: yes

- name: Configure Docker daemon
  ansible.builtin.template:
    src: daemon.json.j2
    dest: /etc/docker/daemon.json
    mode: "0644"
  notify: restart docker

- name: Create Docker systemd directory
  ansible.builtin.file:
    path: /etc/systemd/system/docker.service.d
    state: directory
    mode: "0755"

- name: Add user to docker group
  ansible.builtin.user:
    name: "{{ item }}"
    groups: docker
    append: yes
  loop: "{{ docker_users }}"

- name: Enable and start Docker
  ansible.builtin.systemd:
    name: docker
    enabled: yes
    state: started
```

**Docker Daemon Configuration** (`templates/daemon.json.j2`):

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "live-restore": true,
  "userland-proxy": false,
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  },
  "metrics-addr": "127.0.0.1:9323",
  "experimental": false
}
```

**Variables** (`defaults/main.yml`):

```yaml
---
docker_users:
  - voiceassist
  - ubuntu

docker_log_max_size: 10m
docker_log_max_file: 3
```

### Kubernetes Role

Installs Kubernetes tools (kubectl, helm) and configures cluster access.

**Tasks:**

- Install kubectl
- Install helm
- Configure kubeconfig
- Set up kubectl aliases
- Install k9s for cluster management

**Key Tasks** (`tasks/main.yml`):

```yaml
---
- name: Add Kubernetes GPG key
  ansible.builtin.apt_key:
    url: https://packages.cloud.google.com/apt/doc/apt-key.gpg
    state: present

- name: Add Kubernetes repository
  ansible.builtin.apt_repository:
    repo: "deb https://apt.kubernetes.io/ kubernetes-xenial main"
    state: present

- name: Install kubectl
  ansible.builtin.apt:
    name: kubectl={{ kubectl_version }}
    state: present
    update_cache: yes

- name: Download helm
  ansible.builtin.get_url:
    url: "https://get.helm.sh/helm-v{{ helm_version }}-linux-amd64.tar.gz"
    dest: /tmp/helm.tar.gz
    mode: "0644"

- name: Extract helm
  ansible.builtin.unarchive:
    src: /tmp/helm.tar.gz
    dest: /tmp
    remote_src: yes

- name: Install helm
  ansible.builtin.copy:
    src: /tmp/linux-amd64/helm
    dest: /usr/local/bin/helm
    mode: "0755"
    remote_src: yes

- name: Create kubeconfig directory
  ansible.builtin.file:
    path: "{{ ansible_env.HOME }}/.kube"
    state: directory
    mode: "0700"

- name: Configure kubectl completion
  ansible.builtin.lineinfile:
    path: "{{ ansible_env.HOME }}/.bashrc"
    line: "source <(kubectl completion bash)"
    create: yes

- name: Install k9s
  ansible.builtin.get_url:
    url: "https://github.com/derailed/k9s/releases/download/v{{ k9s_version }}/k9s_Linux_amd64.tar.gz"
    dest: /tmp/k9s.tar.gz
    mode: "0644"
  when: install_k9s | default(true)
```

**Variables** (`defaults/main.yml`):

```yaml
---
kubectl_version: "1.28.0-00"
helm_version: "3.12.0"
k9s_version: "0.27.4"
install_k9s: true
```

### Monitoring Role

Installs and configures monitoring agents.

**Tasks:**

- Install Prometheus node exporter
- Configure log forwarding to Loki
- Set up metrics collection
- Configure health checks

**Key Tasks** (`tasks/main.yml`):

```yaml
---
- name: Create node_exporter user
  ansible.builtin.user:
    name: node_exporter
    system: yes
    shell: /bin/false
    create_home: no

- name: Download node_exporter
  ansible.builtin.get_url:
    url: "https://github.com/prometheus/node_exporter/releases/download/v{{ node_exporter_version }}/node_exporter-{{ node_exporter_version }}.linux-amd64.tar.gz"
    dest: /tmp/node_exporter.tar.gz
    mode: "0644"

- name: Extract node_exporter
  ansible.builtin.unarchive:
    src: /tmp/node_exporter.tar.gz
    dest: /tmp
    remote_src: yes

- name: Install node_exporter
  ansible.builtin.copy:
    src: "/tmp/node_exporter-{{ node_exporter_version }}.linux-amd64/node_exporter"
    dest: /usr/local/bin/node_exporter
    mode: "0755"
    remote_src: yes

- name: Create node_exporter systemd service
  ansible.builtin.template:
    src: node_exporter.service.j2
    dest: /etc/systemd/system/node_exporter.service
    mode: "0644"
  notify: restart node_exporter

- name: Enable and start node_exporter
  ansible.builtin.systemd:
    name: node_exporter
    enabled: yes
    state: started
    daemon_reload: yes
```

**Variables** (`defaults/main.yml`):

```yaml
---
node_exporter_version: "1.6.1"
node_exporter_port: 9100
```

## Inventory Management

### Inventory Structure

**Development** (`inventories/dev/hosts.yml`):

```yaml
---
all:
  vars:
    environment: dev
    ansible_user: ubuntu
    ansible_python_interpreter: /usr/bin/python3

  children:
    docker_hosts:
      hosts:
        dev-docker-01:
          ansible_host: 10.0.1.10

    k8s_nodes:
      hosts:
        dev-k8s-01:
          ansible_host: 10.0.1.20
        dev-k8s-02:
          ansible_host: 10.0.1.21
```

**Production** (`inventories/production/hosts.yml`):

```yaml
---
all:
  vars:
    environment: production
    ansible_user: ubuntu
    ansible_python_interpreter: /usr/bin/python3

  children:
    docker_hosts:
      hosts:
        prod-docker-01:
          ansible_host: 10.0.1.10
        prod-docker-02:
          ansible_host: 10.0.1.11

    k8s_nodes:
      hosts:
        prod-k8s-01:
          ansible_host: 10.0.1.20
        prod-k8s-02:
          ansible_host: 10.0.1.21
        prod-k8s-03:
          ansible_host: 10.0.1.22
```

### Group Variables

**All Hosts** (`inventories/production/group_vars/all.yml`):

```yaml
---
# System configuration
system_timezone: UTC
app_user: voiceassist
app_group: voiceassist

# Security settings
ssh_port: 22
fail2ban_enabled: true

# Monitoring
monitoring_enabled: true
metrics_port: 9100

# Log retention (HIPAA requirement)
log_retention_days: 90
```

**Docker Hosts** (`inventories/production/group_vars/docker_hosts.yml`):

```yaml
---
docker_users:
  - voiceassist
  - ubuntu

docker_log_max_size: 10m
docker_log_max_file: 3
```

## Variables and Secrets

### Variable Precedence

Ansible uses the following precedence (highest to lowest):

1. Extra vars (`-e` on command line)
2. Task vars
3. Block vars
4. Role and include vars
5. Play vars
6. Host facts
7. Host vars
8. Group vars
9. Role defaults

### Managing Secrets with Ansible Vault

**Create encrypted file:**

```bash
ansible-vault create inventories/production/group_vars/vault.yml
```

**Edit encrypted file:**

```bash
ansible-vault edit inventories/production/group_vars/vault.yml
```

**Encrypt existing file:**

```bash
ansible-vault encrypt inventories/production/group_vars/secrets.yml
```

**Decrypt file:**

```bash
ansible-vault decrypt inventories/production/group_vars/secrets.yml
```

**Example vault file** (`group_vars/vault.yml`):

```yaml
---
vault_db_password: "super_secret_password"
vault_api_key: "secret_api_key"
vault_ssl_private_key: |
  -----BEGIN EXAMPLE KEY (NOT REAL)-----
  <your-base64-encoded-key-content-here>
  -----END EXAMPLE KEY (NOT REAL)-----
```

**Using vault variables:**

```yaml
---
# Reference vault variables
db_password: "{{ vault_db_password }}"
api_key: "{{ vault_api_key }}"
```

**Running playbook with vault:**

```bash
# Prompt for vault password
ansible-playbook -i inventories/production site.yml --ask-vault-pass

# Use password file
ansible-playbook -i inventories/production site.yml --vault-password-file ~/.vault_pass

# Use multiple vault IDs
ansible-playbook -i inventories/production site.yml --vault-id prod@~/.vault_pass_prod
```

## Running Playbooks

### Basic Usage

```bash
# Run main playbook
ansible-playbook -i inventories/dev site.yml

# Run with specific tags
ansible-playbook -i inventories/production site.yml --tags security

# Skip specific tags
ansible-playbook -i inventories/production site.yml --skip-tags docker

# Run on specific hosts
ansible-playbook -i inventories/production site.yml --limit k8s_nodes

# Dry run (check mode)
ansible-playbook -i inventories/production site.yml --check

# Show differences
ansible-playbook -i inventories/production site.yml --check --diff
```

### Common Options

| Option              | Description                        |
| ------------------- | ---------------------------------- |
| `-i`                | Specify inventory file             |
| `--tags`            | Run only tasks with specific tags  |
| `--skip-tags`       | Skip tasks with specific tags      |
| `--limit`           | Limit to specific hosts or groups  |
| `--check`           | Dry run without making changes     |
| `--diff`            | Show differences for changed files |
| `-v`, `-vv`, `-vvv` | Increase verbosity                 |
| `--ask-become-pass` | Prompt for sudo password           |
| `--ask-vault-pass`  | Prompt for vault password          |
| `--start-at-task`   | Start at specific task             |

### Running Specific Roles

```bash
# Run only common role
ansible-playbook -i inventories/dev site.yml --tags common

# Run security hardening
ansible-playbook -i inventories/production site.yml --tags security

# Run docker setup
ansible-playbook -i inventories/dev site.yml --tags docker

# Run multiple roles
ansible-playbook -i inventories/production site.yml --tags "common,security,monitoring"
```

### Ad-Hoc Commands

```bash
# Check connectivity
ansible -i inventories/dev all -m ping

# Gather facts
ansible -i inventories/dev all -m setup

# Run shell command
ansible -i inventories/dev all -m shell -a "uptime"

# Install package
ansible -i inventories/dev all -m apt -a "name=vim state=present" --become

# Copy file
ansible -i inventories/dev all -m copy -a "src=/local/file dest=/remote/file" --become

# Restart service
ansible -i inventories/dev all -m systemd -a "name=docker state=restarted" --become
```

## HIPAA Compliance Configuration

### Key HIPAA Requirements

1. **Access Controls**
   - SSH key-based authentication only
   - No root login
   - Multi-factor authentication (when possible)

2. **Audit Logging**
   - All access to PHI must be logged
   - Logs retained for 90 days minimum
   - Audit logs protected from tampering

3. **Encryption**
   - Data at rest encrypted
   - Data in transit encrypted (TLS 1.2+)

4. **Automatic Updates**
   - Security patches applied automatically
   - System updates scheduled regularly

5. **Password Policies**
   - Strong password requirements
   - Password expiration
   - Account lockout after failed attempts

### HIPAA Compliance Playbook

```yaml
---
- name: HIPAA Compliance Configuration
  hosts: all
  become: yes

  tasks:
    - name: Ensure SSH is hardened
      ansible.builtin.lineinfile:
        path: /etc/ssh/sshd_config
        regexp: "{{ item.regexp }}"
        line: "{{ item.line }}"
      loop:
        - { regexp: "^#?PermitRootLogin", line: "PermitRootLogin no" }
        - { regexp: "^#?PasswordAuthentication", line: "PasswordAuthentication no" }
        - { regexp: "^#?Protocol", line: "Protocol 2" }

    - name: Configure password policy
      ansible.builtin.lineinfile:
        path: /etc/pam.d/common-password
        regexp: "^password.*pam_unix.so"
        line: "password required pam_unix.so obscure sha512 minlen=12"

    - name: Set password expiration
      ansible.builtin.lineinfile:
        path: /etc/login.defs
        regexp: "{{ item.regexp }}"
        line: "{{ item.line }}"
      loop:
        - { regexp: "^PASS_MAX_DAYS", line: "PASS_MAX_DAYS 90" }
        - { regexp: "^PASS_MIN_DAYS", line: "PASS_MIN_DAYS 1" }
        - { regexp: "^PASS_WARN_AGE", line: "PASS_WARN_AGE 14" }

    - name: Configure audit rules
      ansible.builtin.copy:
        dest: /etc/audit/rules.d/hipaa.rules
        content: |
          # HIPAA audit rules
          -w /opt/voiceassist/data -p wa -k phi_access
          -w /etc/passwd -p wa -k user_modification
          -w /etc/shadow -p wa -k shadow_modification
      notify: restart auditd
```

## Best Practices

### 1. Idempotency

Ensure tasks are idempotent (safe to run multiple times):

```yaml
# Good: Idempotent
- name: Ensure nginx is installed
  ansible.builtin.apt:
    name: nginx
    state: present

# Bad: Not idempotent
- name: Install nginx
  ansible.builtin.shell: apt install -y nginx
```

### 2. Use Modules Over Shell

```yaml
# Good: Use apt module
- name: Install package
  ansible.builtin.apt:
    name: nginx
    state: present

# Bad: Use shell
- name: Install package
  ansible.builtin.shell: apt install -y nginx
```

### 3. Error Handling

```yaml
- name: Try to start service
  ansible.builtin.systemd:
    name: myservice
    state: started
  ignore_errors: yes
  register: service_result

- name: Handle failure
  ansible.builtin.debug:
    msg: "Service failed to start: {{ service_result.msg }}"
  when: service_result is failed
```

### 4. Use Tags

```yaml
- name: Install packages
  ansible.builtin.apt:
    name: "{{ item }}"
    state: present
  loop:
    - vim
    - htop
  tags:
    - packages
    - common
```

### 5. Variable Naming

```yaml
# Good: Descriptive names
app_version: "2.0.0"
db_max_connections: 100
ssl_certificate_path: "/etc/ssl/certs/app.crt"

# Bad: Unclear names
ver: "2.0.0"
max: 100
cert: "/etc/ssl/certs/app.crt"
```

### 6. Documentation

```yaml
---
# Role: common
# Purpose: Base system configuration
# Dependencies: none

- name: Update package cache
  ansible.builtin.apt:
    update_cache: yes
    cache_valid_time: 3600
  # Cache valid for 1 hour to avoid repeated updates
```

## Troubleshooting

### Common Issues

#### Issue: SSH Connection Failed

**Error:**

```
fatal: [host]: UNREACHABLE! => {"msg": "Failed to connect to the host via ssh"}
```

**Solutions:**

```bash
# Test SSH connectivity
ssh -i ~/.ssh/id_rsa ubuntu@host-ip

# Verify SSH key permissions
chmod 600 ~/.ssh/id_rsa

# Check inventory host address
ansible-inventory -i inventories/dev --list

# Use verbose mode for details
ansible-playbook -i inventories/dev site.yml -vvv
```

#### Issue: Permission Denied

**Error:**

```
fatal: [host]: FAILED! => {"msg": "Missing sudo password"}
```

**Solutions:**

```bash
# Prompt for sudo password
ansible-playbook -i inventories/dev site.yml --ask-become-pass

# Configure passwordless sudo on target
sudo visudo
# Add: username ALL=(ALL) NOPASSWD:ALL
```

#### Issue: Module Not Found

**Error:**

```
fatal: [host]: FAILED! => {"msg": "The module community.general.ufw was not found"}
```

**Solutions:**

```bash
# Install required collections
ansible-galaxy collection install community.general

# Install from requirements file
ansible-galaxy collection install -r requirements.yml
```

#### Issue: Variable Not Defined

**Error:**

```
fatal: [host]: FAILED! => {"msg": "The task includes an option with an undefined variable"}
```

**Solutions:**

```yaml
# Use default filter
variable: "{{ undefined_var | default('default_value') }}"

# Check variable is defined
- name: Use variable
  debug:
    msg: "{{ my_var }}"
  when: my_var is defined
```

### Debugging

```bash
# Increase verbosity
ansible-playbook -i inventories/dev site.yml -vvv

# Check mode (dry run)
ansible-playbook -i inventories/dev site.yml --check

# Show differences
ansible-playbook -i inventories/dev site.yml --check --diff

# Start at specific task
ansible-playbook -i inventories/dev site.yml --start-at-task="Install Docker"

# Step through tasks
ansible-playbook -i inventories/dev site.yml --step

# List tasks
ansible-playbook -i inventories/dev site.yml --list-tasks

# List hosts
ansible-playbook -i inventories/dev site.yml --list-hosts
```

### Logging

```bash
# Enable callback plugin for detailed logs
export ANSIBLE_STDOUT_CALLBACK=debug
ansible-playbook -i inventories/dev site.yml

# Log to file
export ANSIBLE_LOG_PATH=./ansible.log
ansible-playbook -i inventories/dev site.yml
```

---

**Last Updated**: 2025-11-21
**Version**: 2.0
**Maintainer**: DevOps Team
