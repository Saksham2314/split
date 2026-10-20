// SplitSmart CI pipeline (runs on the local Jenkins in jenkins/).
// Every stage must pass: lint → typecheck → unit tests → API tests on a real Postgres → builds →
// Docker images → Trivy scans. Test results show up in Jenkins' "Tests" tab, scan reports as artifacts.

pipeline {
  agent any

  options {
    timeout(time: 40, unit: 'MINUTES')
    ansiColor('xterm')
    buildDiscarder(logRotator(numToKeepStr: '30'))
    disableConcurrentBuilds()
  }

  environment {
    CI = 'true'
    npm_config_cache = "${WORKSPACE}/.npm-cache"
    REPORTS = "${WORKSPACE}/reports"
    // One throwaway database per build, on the Docker network Jenkins is attached to.
    TEST_DB = "ss-ci-db-${BUILD_NUMBER}"
    TEST_DATABASE_URL = "postgres://splitsmart:ci-only-password@ss-ci-db-${BUILD_NUMBER}:5432/splitsmart_test"
  }

  stages {
    stage('Install') {
      steps {
        sh 'node --version && npm --version && docker version --format "docker {{.Server.Version}}"'
        sh 'mkdir -p "$REPORTS" && npm ci --no-audit --no-fund'
      }
    }

    stage('Lint & typecheck') {
      parallel {
        stage('Lint') { steps { sh 'npm run lint' } }
        stage('Typecheck') { steps { sh 'npm run typecheck' } }
      }
    }

    stage('Unit tests') {
      steps {
        sh 'npm run test:unit -w apps/api -- --reporter=default --reporter=junit --outputFile.junit="$REPORTS/api-unit.xml"'
        sh 'npm run test -w apps/web -- --reporter=default --reporter=junit --outputFile.junit="$REPORTS/web-unit.xml"'
      }
    }

    stage('API tests (PostgreSQL)') {
      steps {
        sh '''
          docker run -d --rm --name "$TEST_DB" --network splitsmart-ci --tmpfs /var/lib/postgresql/data \
            -e POSTGRES_USER=splitsmart -e POSTGRES_PASSWORD=ci-only-password -e POSTGRES_DB=splitsmart_test \
            postgres:16.15-alpine
          for i in $(seq 1 30); do
            docker exec "$TEST_DB" pg_isready -U splitsmart -d splitsmart_test -q && break
            sleep 1
          done
          docker exec "$TEST_DB" pg_isready -U splitsmart -d splitsmart_test
        '''
        sh 'npm run test:api -w apps/api -- --reporter=default --reporter=junit --outputFile.junit="$REPORTS/api-integration.xml"'
      }
      post {
        always { sh 'docker rm -f "$TEST_DB" >/dev/null 2>&1 || true' }
      }
    }

    stage('Build') {
      steps { sh 'npm run build' }
    }

    stage('Docker images') {
      steps {
        script { env.SHA = env.GIT_COMMIT.take(7) }
        sh '''
          docker build -q -f apps/api/Dockerfile -t "splitsmart-api:$SHA" .
          docker build -q -f apps/web/Dockerfile -t "splitsmart-web:$SHA" .
          docker image ls --format '{{.Repository}}:{{.Tag}}  {{.Size}}' | grep ":$SHA"
        '''
      }
    }

    stage('Security scan (Trivy)') {
      steps {
        // Fail on HIGH/CRITICAL vulnerabilities that have a fix available: those are actionable.
        // Also scan the repo for committed secrets and vulnerable npm dependencies.
        sh '''
          export TRIVY_CACHE_DIR="$JENKINS_HOME/.cache/trivy"
          rc=0
          for img in api web; do
            trivy image --quiet --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \
              --format table --output "$REPORTS/trivy-$img.txt" "splitsmart-$img:$SHA" || rc=1
            echo "--- splitsmart-$img:$SHA"; cat "$REPORTS/trivy-$img.txt"
          done
          trivy fs --quiet --scanners vuln,secret --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \
            --skip-dirs node_modules --skip-dirs .npm-cache --format table --output "$REPORTS/trivy-repo.txt" . || rc=1
          echo "--- repository"; cat "$REPORTS/trivy-repo.txt"
          exit $rc
        '''
      }
    }
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: 'reports/*.xml'
      archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/*.txt'
      // Images aren't pushed anywhere (the server builds its own), so don't let them pile up locally.
      sh 'docker image rm -f "splitsmart-api:$SHA" "splitsmart-web:$SHA" >/dev/null 2>&1 || true'
    }
    success { echo "✅ ${env.GIT_COMMIT?.take(7)} passed all checks" }
    failure { echo "❌ ${env.GIT_COMMIT?.take(7)} failed: see the stage marked red" }
  }
}
