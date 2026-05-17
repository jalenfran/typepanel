# TypePanel Kubernetes Deployment

Simple manifests to run TypePanel on your k3s cluster.

## Files

- `typepanel-namespace.yaml` – Namespace definition (`typepanel`)
- `typepanel-deployment.yaml` – App Deployment (uses a container image)
- `typepanel-service.yaml` – NodePort Service on `30110`

## Prerequisites

- A container registry (you are using GHCR: `ghcr.io/jalenfran/typepanel`).
- Docker available on any machine that can build and push (can be your laptop or `cluster1`).
- Your k3s cluster reachable via `sudo kubectl`.

## Build and push image to GHCR

From the repo root on a machine with Docker:

```bash
cd /home/server/projects/TypePanel

# Build image
docker build -t ghcr.io/jalenfran/typepanel:latest .

# Log in to GHCR once if needed:
# echo "$GHCR_TOKEN" | docker login ghcr.io -u jalenfran --password-stdin

# Push image
docker push ghcr.io/jalenfran/typepanel:latest
```

`typepanel-deployment.yaml` is configured to use:

```yaml
image: ghcr.io/jalenfran/typepanel:latest
```

## Deploy to the cluster

From `cluster1` (or wherever you run `kubectl` against k3s):

```bash
cd /home/server/projects/TypePanel/kubernetes

sudo kubectl apply -f typepanel-namespace.yaml
sudo kubectl apply -f typepanel-deployment.yaml
sudo kubectl apply -f typepanel-service.yaml
```

Check status:

```bash
sudo kubectl get pods -n typepanel
sudo kubectl get svc -n typepanel
```

The service listens on:

- `NodePort`: `30110`
- `URL`: `http://<node-ip>:30110`

Later you can add an nginx vhost (like your other services) that proxies a domain
such as `type.jalencode.com` to `http://127.0.0.1:30110`.

