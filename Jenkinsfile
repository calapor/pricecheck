// PriceCheck CI/CD — runs entirely on the self-hosted arm64 (Raspberry Pi) cluster.
// Agents are ephemeral Kubernetes pods. All container images below are multi-arch
// and run natively on aarch64. Images are built with Kaniko (no Docker daemon) and
// pushed to the in-cluster registry; deploy is `helm upgrade` via an in-cluster SA.
pipeline {
  agent {
    kubernetes {
      defaultContainer 'node'
      yaml '''
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: jenkins-deployer
  securityContext:
    fsGroup: 1000
  containers:
    - name: node            # build + test (node:22 is multi-arch / arm64)
      image: node:22-bookworm
      command: ["sleep"]
      args: ["infinity"]
      resources:
        requests: { cpu: "500m", memory: "1Gi" }
        limits:   { cpu: "2",    memory: "2Gi" }
    - name: kaniko          # OCI image build (executor images are multi-arch / arm64)
      image: gcr.io/kaniko-project/executor:v1.23.2-debug
      command: ["sleep"]
      args: ["infinity"]
      resources:
        requests: { cpu: "500m", memory: "1Gi" }
        limits:   { cpu: "2",    memory: "2.5Gi" }
    - name: helm            # deploy (alpine/helm is multi-arch / arm64)
      image: alpine/helm:3.16.3
      command: ["sleep"]
      args: ["infinity"]
      resources:
        requests: { cpu: "100m", memory: "128Mi" }
        limits:   { cpu: "500m", memory: "256Mi" }
'''
    }
  }

  options {
    disableConcurrentBuilds()
    timeout(time: 45, unit: 'MINUTES')   // Pi builds are slower than cloud runners
  }

  environment {
    REGISTRY   = 'registry.pricecheck:5000'   // in-cluster registry (HTTP/insecure)
    IMAGE_REPO = 'pricecheck'
    NAMESPACE  = 'pricecheck'
  }

stage('Setup') {
  steps {
    container('node') {
      sh 'git config --global --add safe.directory "$WORKSPACE"'

      script {
        env.IMAGE_TAG = sh(
          returnStdout: true,
          script: 'git rev-parse --short HEAD'
        ).trim()
      }

      sh 'corepack enable && corepack prepare pnpm@11.1.1 --activate'
    }
  }
}
    stage('Install') {
      steps { container('node') { sh 'pnpm install --frozen-lockfile' } }
    }

    stage('Verify') {
      steps {
        container('node') {
          sh 'pnpm -r lint'
          sh 'pnpm -r typecheck'
          sh 'pnpm -r test'
          sh 'pnpm -r build'
        }
      }
    }

    stage('Build & push images') {
      when { branch 'main' }
      steps {
        container('kaniko') {
          sh '''
            for app in web worker; do
              /kaniko/executor \
                --context "dir://$PWD" \
                --dockerfile "deploy/docker/${app}.Dockerfile" \
                --destination "${REGISTRY}/${IMAGE_REPO}/${app}:${IMAGE_TAG}" \
                --destination "${REGISTRY}/${IMAGE_REPO}/${app}:main" \
                --insecure --skip-tls-verify --cache=true
            done
          '''
        }
      }
    }

    stage('Deploy') {
      when { branch 'main' }
      steps {
        container('helm') {
          sh '''
            helm upgrade --install pricecheck deploy/helm/pricecheck \
              --namespace "${NAMESPACE}" --create-namespace \
              --set image.registry="${REGISTRY}" \
              --set image.repository="${IMAGE_REPO}" \
              --set image.tag="${IMAGE_TAG}" \
              --set ingress.enabled=false \
              --wait --timeout 10m
          '''
        }
      }
    }
  }

  post {
    success { echo "Deployed pricecheck @ ${env.IMAGE_TAG}" }
    failure { echo "Pipeline failed — see stage logs." }
  }
}
