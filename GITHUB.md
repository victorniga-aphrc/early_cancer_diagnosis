# GitHub Setup Guide

Reference for repository configuration, SSH setup, and common tasks.

---

## Repository

| Item | Value |
|------|-------|
| **Account** | victorniga-aphrc |
| **Repository** | early_cancer_diagnosis |
| **URL (HTTPS)** | https://github.com/victorniga-aphrc/early_cancer_diagnosis |
| **URL (SSH)** | git@github.com:victorniga-aphrc/early_cancer_diagnosis.git |

---

## SSH Setup (recommended)

### 1. Check for existing keys

```bash
ls -la ~/.ssh
```

### 2. Generate a new key (if needed)

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

### 3. Add key to SSH agent

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

### 4. Copy public key

```bash
cat ~/.ssh/id_ed25519.pub
```

### 5. Add key on GitHub

1. Go to [GitHub → Settings → SSH and GPG keys](https://github.com/settings/keys)
2. Click **New SSH key**
3. Paste the public key
4. Save

### 6. Use SSH remote

```bash
git remote set-url origin git@github.com:victorniga-aphrc/early_cancer_diagnosis.git
```

### 7. Test connection

```bash
ssh -T git@github.com
```

---

## Common Commands

| Task | Command |
|------|---------|
| Check remote | `git remote -v` |
| Switch to SSH | `git remote set-url origin git@github.com:victorniga-aphrc/early_cancer_diagnosis.git` |
| Switch to HTTPS | `git remote set-url origin https://github.com/victorniga-aphrc/early_cancer_diagnosis.git` |
| Push | `git push origin main` |
| Pull | `git pull origin main` |

---

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/python-app.yml`

- **Triggers**: Push or PR to `main`
- **Steps**: Checkout → Python 3.10 → Install deps → Flake8 lint → Pytest

---

## Troubleshooting

### 403 / Permission denied

- **Cause**: Authenticating as wrong account (e.g. nigavictor vs victorniga-aphrc)
- **Fix**: Use SSH and ensure the key is added to the correct GitHub account (victorniga-aphrc)

### Password prompts (HTTPS)

- GitHub no longer accepts account passwords; use a Personal Access Token (PAT) or switch to SSH
- Credential caching: `git config --global credential.helper store` (caches PAT after first use)

### SSH "Permission denied (publickey)"

- Ensure the public key is added to GitHub
- Run `ssh-add ~/.ssh/id_ed25519` if the key wasn’t added to the agent
- Test with `ssh -T git@github.com`
