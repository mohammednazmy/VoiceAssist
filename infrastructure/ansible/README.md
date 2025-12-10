# VoiceAssist Ansible Configuration

Server configuration and management for VoiceAssist V2 using Ansible.

## Quick Start

### Prerequisites

- Ansible >= 2.15
- Python >= 3.8
- SSH access to target hosts
- sudo privileges on target hosts

### Install Ansible

```bash
# macOS
brew install ansible

# Linux (Ubuntu/Debian)
sudo apt update
sudo apt install ansible

# Python pip
pip install ansible
```

### Install Required Collections

```bash
# Install from requirements file
ansible-galaxy collection install -r requirements.yml

# Or install individually
ansible-galaxy collection install community.general
ansible-galaxy collection install ansible.posix
```

### Run Playbook

```bash
# Development environment
ansible-playbook -i inventories/dev site.yml

# Staging environment
ansible-playbook -i inventories/staging site.yml

# Production environment (with vault)
ansible-playbook -i inventories/production site.yml --ask-vault-pass
```

## Directory Structure

```
ansible/
├── ansible.cfg              # Ansible configuration
├── site.yml                 # Main playbook
├── requirements.yml         # Required collections
│
├── inventories/            # Environment inventories
│   ├── dev/
│   │   ├── hosts.yml       # Host definitions
│   │   └── group_vars/
│   │       ├── all.yml     # Variables for all hosts
│   │       └── vault.yml   # Encrypted secrets
│   │
│   ├── staging/
│   │   └── ...
│   │
│   └── production/
│       └── ...
│
├── playbooks/              # Specific task playbooks
│   ├── update_packages.yml
│   ├── rotate_credentials.yml
│   └── security_audit.yml
│
└── roles/                  # Ansible roles
    ├── common/             # Base configuration
    ├── security/           # Security hardening
    ├── docker/             # Docker installation
    ├── kubernetes/         # K8s tools
    └── monitoring/         # Monitoring agents
```

## Roles

### Common Role

Base system configuration for all servers.

**Tasks:**

- System package updates
- Essential utilities installation
- Timezone and NTP configuration
- User and group management
- Directory structure setup

**Usage:**

```bash
ansible-playbook -i inventories/dev site.yml --tags common
```

### Security Role

HIPAA-compliant security hardening.

**Tasks:**

- UFW firewall configuration
- fail2ban installation
- SSH hardening
- Audit logging (auditd)
- Automatic security updates
- Password policies

**Usage:**

```bash
ansible-playbook -i inventories/production site.yml --tags security
```

### Docker Role

Docker container runtime setup.

**Tasks:**

- Docker CE installation
- Daemon configuration
- User permissions
- Log rotation setup

**Usage:**

```bash
ansible-playbook -i inventories/dev site.yml --tags docker
```

### Kubernetes Role

Kubernetes tools installation.

**Tasks:**

- kubectl installation
- helm installation
- kubeconfig setup
- k9s installation (optional)

**Usage:**

```bash
ansible-playbook -i inventories/staging site.yml --tags kubernetes
```

### Monitoring Role

Observability agent setup.

**Tasks:**

- Prometheus node exporter
- Log forwarding configuration
- Health check setup

**Usage:**

```bash
ansible-playbook -i inventories/production site.yml --tags monitoring
```

## Inventory Configuration

### Development Inventory

`inventories/dev/hosts.yml`:

```yaml
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
```

### Production Inventory

`inventories/production/hosts.yml`:

```yaml
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

## Common Tasks

### Run Full Configuration

```bash
# All roles on all hosts
ansible-playbook -i inventories/production site.yml

# Verbose output
ansible-playbook -i inventories/production site.yml -v

# Dry run (check mode)
ansible-playbook -i inventories/production site.yml --check
```

### Run Specific Roles

```bash
# Run only security role
ansible-playbook -i inventories/production site.yml --tags security

# Run common and docker roles
ansible-playbook -i inventories/dev site.yml --tags "common,docker"

# Skip specific role
ansible-playbook -i inventories/production site.yml --skip-tags monitoring
```

### Target Specific Hosts

```bash
# Run on specific host
ansible-playbook -i inventories/production site.yml --limit prod-k8s-01

# Run on group
ansible-playbook -i inventories/production site.yml --limit k8s_nodes

# Run on multiple hosts
ansible-playbook -i inventories/production site.yml --limit "prod-k8s-01,prod-k8s-02"
```

### Update Packages

```bash
# Update all packages
ansible -i inventories/production all -m apt -a "upgrade=dist update_cache=yes" --become

# Or use playbook
ansible-playbook -i inventories/production playbooks/update_packages.yml
```

### Restart Services

```bash
# Restart docker
ansible -i inventories/dev docker_hosts -m systemd -a "name=docker state=restarted" --become

# Restart all services
ansible-playbook -i inventories/production site.yml --tags restart
```

## Managing Secrets

### Create Vault File

```bash
# Create new encrypted file
ansible-vault create inventories/production/group_vars/vault.yml

# Enter vault password when prompted
# Add secrets:
# vault_db_password: "super_secret"
# vault_api_key: "secret_key"
```

### Edit Vault File

```bash
# Edit encrypted file
ansible-vault edit inventories/production/group_vars/vault.yml
```

### Encrypt Existing File

```bash
# Encrypt file
ansible-vault encrypt inventories/production/group_vars/secrets.yml

# Decrypt file
ansible-vault decrypt inventories/production/group_vars/secrets.yml
```

### Use Vault in Playbook

```bash
# Prompt for password
ansible-playbook -i inventories/production site.yml --ask-vault-pass

# Use password file
ansible-playbook -i inventories/production site.yml --vault-password-file ~/.vault_pass

# Use multiple vaults
ansible-playbook -i inventories/production site.yml --vault-id prod@~/.vault_pass_prod
```

## Ad-Hoc Commands

### Check Connectivity

```bash
# Ping all hosts
ansible -i inventories/dev all -m ping

# Ping specific group
ansible -i inventories/production k8s_nodes -m ping
```

### Gather Facts

```bash
# Gather all facts
ansible -i inventories/dev all -m setup

# Gather specific facts
ansible -i inventories/dev all -m setup -a "filter=ansible_distribution*"
```

### Run Shell Commands

```bash
# Check uptime
ansible -i inventories/production all -m shell -a "uptime"

# Check disk space
ansible -i inventories/production all -m shell -a "df -h"

# Check memory
ansible -i inventories/production all -m shell -a "free -h"
```

### Copy Files

```bash
# Copy file to all hosts
ansible -i inventories/dev all -m copy -a "src=/local/file dest=/remote/file" --become

# Copy with specific permissions
ansible -i inventories/dev all -m copy -a "src=/local/file dest=/remote/file mode=0644 owner=root" --become
```

## Examples

### Setup New Server

```bash
# 1. Add server to inventory
vim inventories/dev/hosts.yml

# 2. Test connectivity
ansible -i inventories/dev new-server -m ping

# 3. Run full configuration
ansible-playbook -i inventories/dev site.yml --limit new-server

# 4. Verify
ansible -i inventories/dev new-server -m shell -a "docker --version"
```

### Security Hardening

```bash
# Run security role only
ansible-playbook -i inventories/production site.yml --tags security

# Verify SSH configuration
ansible -i inventories/production all -m shell -a "grep '^PermitRootLogin' /etc/ssh/sshd_config"

# Check firewall status
ansible -i inventories/production all -m shell -a "ufw status" --become
```

### Install Docker on New Hosts

```bash
# Target docker_hosts group
ansible-playbook -i inventories/staging site.yml --tags docker --limit docker_hosts

# Verify installation
ansible -i inventories/staging docker_hosts -m shell -a "docker --version"

# Test docker
ansible -i inventories/staging docker_hosts -m shell -a "docker run hello-world" --become
```

### Update System Packages

```bash
# Update cache and upgrade
ansible-playbook -i inventories/production playbooks/update_packages.yml

# Or use ad-hoc command
ansible -i inventories/production all -m apt -a "upgrade=dist update_cache=yes" --become

# Reboot if needed
ansible -i inventories/production all -m reboot --become
```

## Troubleshooting

### SSH Connection Issues

```bash
# Test SSH manually
ssh -i ~/.ssh/id_rsa ubuntu@<host-ip>

# Verify SSH key permissions
chmod 600 ~/.ssh/id_rsa

# Use verbose mode
ansible-playbook -i inventories/dev site.yml -vvv
```

### Permission Denied

```bash
# Prompt for sudo password
ansible-playbook -i inventories/dev site.yml --ask-become-pass

# Check user has sudo access
ansible -i inventories/dev all -m shell -a "sudo -l"
```

### Module Not Found

```bash
# Install required collections
ansible-galaxy collection install -r requirements.yml

# List installed collections
ansible-galaxy collection list
```

### Playbook Fails

```bash
# Run in check mode first
ansible-playbook -i inventories/dev site.yml --check

# Start at specific task
ansible-playbook -i inventories/dev site.yml --start-at-task="Install Docker"

# Step through tasks
ansible-playbook -i inventories/dev site.yml --step
```

### Debug Variables

```bash
# Show variables for host
ansible-inventory -i inventories/dev --host dev-k8s-01

# List all hosts
ansible-inventory -i inventories/dev --list

# Show group variables
ansible -i inventories/dev k8s_nodes -m debug -a "var=hostvars[inventory_hostname]"
```

## Best Practices

1. **Use idempotent tasks** - Safe to run multiple times
2. **Prefer modules over shell** - Use apt module instead of `shell: apt install`
3. **Use tags** - Organize tasks with meaningful tags
4. **Encrypt secrets** - Always use ansible-vault for sensitive data
5. **Test in dev first** - Never run untested playbooks in production
6. **Use check mode** - Dry run before applying changes
7. **Document variables** - Clear variable names and comments
8. **Handle errors** - Use `ignore_errors` and `register` appropriately
9. **Use handlers** - For service restarts
10. **Keep roles focused** - One purpose per role

## Performance Tips

1. **Use pipelining**:

   ```ini
   [ssh_connection]
   pipelining = True
   ```

2. **Increase forks**:

   ```ini
   [defaults]
   forks = 20
   ```

3. **Use fact caching**:

   ```ini
   [defaults]
   gathering = smart
   fact_caching = jsonfile
   fact_caching_connection = /tmp/ansible_facts
   fact_caching_timeout = 86400
   ```

4. **Disable gathering when not needed**:
   ```yaml
   - hosts: all
     gather_facts: no
   ```

## Additional Resources

- [Ansible Documentation](https://docs.ansible.com/)
- [Ansible Galaxy](https://galaxy.ansible.com/)
- [VoiceAssist Ansible Guide](../../docs/ANSIBLE_GUIDE.md)
- [Infrastructure as Code Guide](../../docs/INFRASTRUCTURE_AS_CODE.md)

## Support

For issues or questions:

- Create GitHub issue
- Contact DevOps team
- Check [Troubleshooting Guide](../../docs/ANSIBLE_GUIDE.md#troubleshooting)

---

**Last Updated**: 2025-11-21
**Maintainer**: DevOps Team
