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
        # ephemeral-storage request routes the agent onto a node with enough free
        # disk for the build scratch, and the matching *limit* is the safety net:
        # if buildah's storage ever overruns it, the kubelet evicts just this pod
        # instead of letting the node fill up — a runaway build used to fill a Pi's
        # disk, trip DiskPressure and reboot the whole node (aborting the build and
        # briefly evicting every other pod on it). The overlay storage driver (see
        # the Build stage) shares layers instead of copying each one in full, so
        # actual usage stays well under this ceiling.
        requests: { cpu: "500m", memory: "1Gi",   ephemeral-storage: "12Gi" }
        limits:   { cpu: "2",    memory: "2.5Gi", ephemeral-storage: "12Gi" }
'''
    }
  }

  options {
    disableConcurrentBuilds()
    timeout(time: 120, unit: 'MINUTES')
  }

  parameters {
    booleanParam(
      name: 'DEPLOY_DEMO',
      defaultValue: true,
      description: 'Also deploy the showcase "pricecheck-demo" release (NodePort 30090, seeded SuperValu sample data).'
    )
    string(
      name: 'GENERATOR_MAX_TOKENS',
      defaultValue: '16000',
      description: 'Max output tokens for the AI scraper generator (GENERATOR_MAX_TOKENS env var on the web pod).'
    )
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
            buildah --storage-driver overlay rm --all || true
            buildah --storage-driver overlay rmi --prune || true
          '''
          sh '''
            for app in web worker; do
              buildah --storage-driver overlay bud --isolation chroot \
                -f "deploy/docker/${app}.Dockerfile" \
                --build-arg "APP_VERSION=${IMAGE_TAG} (#${BUILD_NUMBER})" \
                -t "${REGISTRY}/${IMAGE_REPO}/${app}:${IMAGE_TAG}" \
                -t "${REGISTRY}/${IMAGE_REPO}/${app}:main" .
              for tag in "${IMAGE_TAG}" main; do
                buildah --storage-driver overlay push --tls-verify=false \
                  "${REGISTRY}/${IMAGE_REPO}/${app}:${tag}" \
                  "docker://${REGISTRY}/${IMAGE_REPO}/${app}:${tag}"
              done
              # Reclaim this image's layers before building the next app —
              # otherwise web + worker scratch accumulate in the agent pod and the
              # second build runs the node out of disk mid-layer.
              buildah --storage-driver overlay rm --all || true
              buildah --storage-driver overlay rmi --all || true
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
          withCredentials([
            string(credentialsId: 'postgres-password', variable: 'PG_PASSWORD'),
            string(credentialsId: 'anthropic-api-key', variable: 'ANTHROPIC_KEY'),
            string(credentialsId: 'admin-password', variable: 'ADMIN_PASSWORD'),
          ]) {
            sh '''
              # An interrupted prior deploy (aborted job, evicted node, or the
              # pipeline timeout firing mid --wait) leaves the release in a
              # *-pending state, and helm then refuses every upgrade with
              # "another operation (install/upgrade/rollback) is in progress".
              # Clear that leftover state before deploying so one bad run does
              # not wedge all future ones.
              STATUS=$(helm status pricecheck -n "${NAMESPACE}" -o json 2>/dev/null \
                | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
              case "${STATUS}" in
                pending-install)
                  echo "Release stuck in pending-install from an interrupted run — uninstalling."
                  helm uninstall pricecheck -n "${NAMESPACE}" --wait || true
                  ;;
                pending-upgrade|pending-rollback)
                  echo "Release stuck in ${STATUS} from an interrupted run — rolling back to last deployed revision."
                  helm rollback pricecheck -n "${NAMESPACE}" --wait --timeout 5m || true
                  ;;
              esac

              helm upgrade --install pricecheck deploy/helm/pricecheck \
                --namespace "${NAMESPACE}" --create-namespace \
                --set image.registry="${REGISTRY}" \
                --set image.repository="${IMAGE_REPO}" \
                --set image.tag="${IMAGE_TAG}" \
                --set postgres.password="${PG_PASSWORD}" \
                --set secrets.anthropicApiKey="${ANTHROPIC_KEY}" \
                --set secrets.adminPassword="${ADMIN_PASSWORD}" \
                --set config.generatorMaxTokens="${GENERATOR_MAX_TOKENS}" \
                --wait --timeout 90m
            '''

            script {
              if (params.DEPLOY_DEMO) {
                // The showcase demo is a second, self-contained release (its own
                // Postgres/Redis, NodePort 30090, seeded SuperValu sample data).
                sh '''
                  # Same interrupted-deploy recovery as the main release above.
                  STATUS=$(helm status pricecheck-demo -n "${NAMESPACE}" -o json 2>/dev/null \
                    | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
                  case "${STATUS}" in
                    pending-install)
                      echo "Demo release stuck in pending-install — uninstalling."
                      helm uninstall pricecheck-demo -n "${NAMESPACE}" --wait || true
                      ;;
                    pending-upgrade|pending-rollback)
                      echo "Demo release stuck in ${STATUS} — rolling back."
                      helm rollback pricecheck-demo -n "${NAMESPACE}" --wait --timeout 5m || true
                      ;;
                  esac

                  helm upgrade --install pricecheck-demo deploy/helm/pricecheck \
                    --namespace "${NAMESPACE}" --create-namespace \
                    -f deploy/helm/pricecheck/values-demo.yaml \
                    --set image.registry="${REGISTRY}" \
                    --set image.repository="${IMAGE_REPO}" \
                    --set image.tag="${IMAGE_TAG}" \
                    --set postgres.password="${PG_PASSWORD}" \
                    --set secrets.anthropicApiKey="${ANTHROPIC_KEY}" \
                    --set secrets.adminPassword="${ADMIN_PASSWORD}" \
                    --wait --timeout 90m
                '''
              }
            }
          }
        }
      }
    }

  }

  post {
    always {
      container('buildah') {
        sh '''
          buildah --storage-driver overlay rm --all || true
          buildah --storage-driver overlay rmi --all || true
        '''
      }
    }

    success {
      echo "Deployed pricecheck @ ${env.IMAGE_TAG}"
    }

    failure {
      echo 'Pipeline failed — see stage logs.'
    }
  }
}
