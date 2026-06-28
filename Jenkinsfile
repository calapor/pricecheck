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
    - name: node
      image: node:22-bookworm
      command: ["sleep"]
      args: ["infinity"]
      resources:
        requests: { cpu: "500m", memory: "1Gi" }
        limits:   { cpu: "2",    memory: "2Gi" }

    - name: helm
      image: alpine/helm:3.16.3
      command: ["sleep"]
      args: ["infinity"]
      resources:
        requests: { cpu: "100m", memory: "128Mi" }
        limits:   { cpu: "500m", memory: "256Mi" }

    # Builds both images. Kaniko's snapshotter drops some of pnpm's .pnpm store
    # symlinks (e.g. pino-std-serializers), so the worker/scheduler crash with
    # ERR_MODULE_NOT_FOUND at runtime. Buildah preserves symlinks correctly.
    # (One builder also keeps the agent pod's summed memory requests within a Pi node.)
    - name: buildah
      image: quay.io/buildah/stable:v1.37.5
      command: ["sleep"]
      args: ["infinity"]
      securityContext:
        privileged: true
      resources:
        requests: { cpu: "500m", memory: "1Gi" }
        limits:   { cpu: "2",    memory: "2.5Gi" }
'''
    }
  }

  options {
    disableConcurrentBuilds()
    timeout(time: 120, unit: 'MINUTES')
  }

  environment {
    // In-cluster registry addressed by the cluster IP + NodePort (HTTP/insecure).
    // The same ref works for Kaniko (in-cluster) and the kubelet pull; nodes need a
    // one-time, project-agnostic insecure-registry entry (see specs/jenkins-setup.md).
    REGISTRY   = '192.168.1.101:30500'
    IMAGE_REPO = 'pricecheck'
    NAMESPACE  = 'pricecheck'
  }

  stages {

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


    stage('Debug Branch') {
      steps {
        container('node') {
          sh '''
            echo "BRANCH_NAME=${BRANCH_NAME}"
            echo "GIT_BRANCH=${GIT_BRANCH}"
            echo "WORKSPACE=${WORKSPACE}"

            git config --global --add safe.directory "$WORKSPACE"

            echo "Current branch:"
            git rev-parse --abbrev-ref HEAD

            echo "Current commit:"
            git rev-parse HEAD
          '''
        }

      }
    }



    stage('Install') {
      steps {
        container('node') {
          sh 'pnpm install --frozen-lockfile'
        }
      }
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
      when {
        expression {
          env.GIT_BRANCH?.endsWith('/main')
        }
      }
      steps {
        container('buildah') {
          sh '''
            for app in web worker; do
              buildah --storage-driver vfs bud --isolation chroot \
                -f "deploy/docker/${app}.Dockerfile" \
                --build-arg "APP_VERSION=${IMAGE_TAG} (#${BUILD_NUMBER})" \
                -t "${REGISTRY}/${IMAGE_REPO}/${app}:${IMAGE_TAG}" \
                -t "${REGISTRY}/${IMAGE_REPO}/${app}:main" .
              for tag in "${IMAGE_TAG}" main; do
                buildah --storage-driver vfs push --tls-verify=false \
                  "${REGISTRY}/${IMAGE_REPO}/${app}:${tag}" \
                  "docker://${REGISTRY}/${IMAGE_REPO}/${app}:${tag}"
              done
            done
          '''
        }
      }
    }

    stage('Deploy') {
      when {
        expression {
          env.GIT_BRANCH?.endsWith('/main')
        }
      }
      steps {
        container('helm') {
          sh '''
            helm upgrade --install pricecheck deploy/helm/pricecheck \
              --namespace "${NAMESPACE}" --create-namespace \
              --set image.registry="${REGISTRY}" \
              --set image.repository="${IMAGE_REPO}" \
              --set image.tag="${IMAGE_TAG}" \
              --set ingress.enabled=false \
              --wait --timeout 90m
          '''
        }
      }
    }

  }

  post {
    success {
      echo "Deployed pricecheck @ ${env.IMAGE_TAG}"
    }

    failure {
      echo 'Pipeline failed — see stage logs.'
    }
  }
}
