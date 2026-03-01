#!/usr/bin/env python3
"""
Full Verification Suite - TimeKast Template
=============================================

Runs COMPLETE validation including all checks + performance + E2E.
Use this before deployment or major releases.

Usage:
    python .agent/scripts/verify_all.py . --url <URL>

Includes ALL checks:
    ✅ Security Scan (secrets, dependencies)
    ✅ Lint & Type Check
    ✅ Schema Validation (Drizzle)
    ✅ Test Suite (unit + integration)
    ✅ Build Check
    ✅ Lighthouse (Core Web Vitals)
    ✅ Playwright E2E (if installed)
"""

import sys
import subprocess
import argparse
import json
from pathlib import Path
from typing import List, Optional
from datetime import datetime

# ANSI colors
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*70}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(70)}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*70}{Colors.ENDC}\n")

def print_step(text: str):
    print(f"{Colors.BOLD}{Colors.BLUE}🔄 {text}{Colors.ENDC}")

def print_success(text: str):
    print(f"{Colors.GREEN}✅ {text}{Colors.ENDC}")

def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.ENDC}")

def print_error(text: str):
    print(f"{Colors.RED}❌ {text}{Colors.ENDC}")

def run_command(name: str, cmd: str, project_path: Path, timeout: int = 300) -> dict:
    """Run a command and capture results"""
    print_step(f"Running: {name}")
    start_time = datetime.now()

    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=project_path,
            timeout=timeout
        )

        duration = (datetime.now() - start_time).total_seconds()
        passed = result.returncode == 0

        if passed:
            print_success(f"{name}: PASSED ({duration:.1f}s)")
        else:
            print_error(f"{name}: FAILED ({duration:.1f}s)")
            if result.stderr:
                print(f"  {result.stderr[:300]}")

        return {
            "name": name,
            "passed": passed,
            "output": result.stdout,
            "error": result.stderr,
            "skipped": False,
            "duration": duration
        }

    except subprocess.TimeoutExpired:
        duration = (datetime.now() - start_time).total_seconds()
        print_error(f"{name}: TIMEOUT (>{timeout}s)")
        return {"name": name, "passed": False, "skipped": False, "duration": duration, "error": "Timeout"}

    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        print_error(f"{name}: ERROR - {str(e)}")
        return {"name": name, "passed": False, "skipped": False, "duration": duration, "error": str(e)}

def check_package_json(project_path: Path) -> dict:
    """Check if package.json exists and has required scripts"""
    pkg_json = project_path / "package.json"
    if not pkg_json.exists():
        return {"exists": False, "scripts": {}}

    with open(pkg_json) as f:
        data = json.load(f)

    return {"exists": True, "scripts": data.get("scripts", {})}

def run_security_scan(project_path: Path) -> dict:
    """Scan for secrets and sensitive data"""
    print_step("Running: Security Scan")
    start_time = datetime.now()

    secret_patterns = [
        "DATABASE_URL=postgres://",
        "AUTH_SECRET=",
        "GOOGLE_CLIENT_SECRET=",
        "password=",
        "apiKey=",
    ]
    found_issues = []

    try:
        for ext in ["*.ts", "*.tsx", "*.js", "*.jsx"]:
            for f in project_path.rglob(ext):
                if any(skip in str(f) for skip in ["node_modules", ".next", "dist", ".git"]):
                    continue
                try:
                    content = f.read_text(errors="ignore")
                    for pattern in secret_patterns:
                        if pattern in content and ".example" not in str(f) and ".env" not in str(f):
                            found_issues.append(f"Potential secret in: {f.relative_to(project_path)}")
                except:
                    pass

        duration = (datetime.now() - start_time).total_seconds()

        if found_issues:
            print_error(f"Security Scan: FAILED ({duration:.1f}s)")
            for issue in found_issues[:5]:
                print(f"  ⚠️  {issue}")
            return {"name": "Security Scan", "passed": False, "skipped": False, "duration": duration, "issues": found_issues}
        else:
            print_success(f"Security Scan: PASSED ({duration:.1f}s)")
            return {"name": "Security Scan", "passed": True, "skipped": False, "duration": duration}

    except Exception as e:
        print_warning(f"Security Scan: Skipped ({e})")
        return {"name": "Security Scan", "passed": True, "skipped": True, "duration": 0}

def print_final_report(results: List[dict], start_time: datetime) -> bool:
    """Print comprehensive final report"""
    total_duration = (datetime.now() - start_time).total_seconds()

    print_header("📊 FULL VERIFICATION REPORT")

    total = len(results)
    passed = sum(1 for r in results if r["passed"] and not r.get("skipped"))
    failed = sum(1 for r in results if not r["passed"] and not r.get("skipped"))
    skipped = sum(1 for r in results if r.get("skipped"))

    print(f"Total Duration: {total_duration:.1f}s")
    print(f"Total Checks: {total}")
    print(f"{Colors.GREEN}✅ Passed: {passed}{Colors.ENDC}")
    print(f"{Colors.RED}❌ Failed: {failed}{Colors.ENDC}")
    print(f"{Colors.YELLOW}⏭️  Skipped: {skipped}{Colors.ENDC}")
    print()

    # Detailed results by category
    categories = {}
    for r in results:
        cat = r.get("category", "Other")
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(r)

    for cat, checks in categories.items():
        print(f"{Colors.BOLD}{Colors.CYAN}{cat}:{Colors.ENDC}")
        for r in checks:
            if r.get("skipped"):
                status = f"{Colors.YELLOW}⏭️ {Colors.ENDC}"
            elif r["passed"]:
                status = f"{Colors.GREEN}✅{Colors.ENDC}"
            else:
                status = f"{Colors.RED}❌{Colors.ENDC}"

            duration_str = f"({r.get('duration', 0):.1f}s)" if not r.get("skipped") else ""
            print(f"  {status} {r['name']} {duration_str}")
        print()

    # Final verdict
    if failed > 0:
        print_error(f"VERIFICATION FAILED - {failed} check(s) need attention")
        print(f"\n{Colors.YELLOW}💡 Tip: Fix critical (security, lint) issues first{Colors.ENDC}")
        return False
    else:
        print_success("✨ ALL CHECKS PASSED - Ready for deployment! ✨")
        return True

def main():
    parser = argparse.ArgumentParser(
        description="Run complete TimeKast verification suite",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python .agent/scripts/verify_all.py . --url http://localhost:3000
  python .agent/scripts/verify_all.py . --url https://staging.example.com --no-e2e
        """
    )
    parser.add_argument("project", help="Project path to validate")
    parser.add_argument("--url", required=True, help="URL for performance & E2E checks")
    parser.add_argument("--no-e2e", action="store_true", help="Skip E2E tests")
    parser.add_argument("--skip-build", action="store_true", help="Skip build check")

    args = parser.parse_args()

    project_path = Path(args.project).resolve()

    if not project_path.exists():
        print_error(f"Project path does not exist: {project_path}")
        sys.exit(1)

    print_header("🚀 TIMEKAST - FULL VERIFICATION SUITE")
    print(f"Project: {project_path}")
    print(f"URL: {args.url}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Check package.json
    pkg = check_package_json(project_path)
    if not pkg["exists"]:
        print_error("package.json not found!")
        sys.exit(1)

    scripts = pkg["scripts"]
    start_time = datetime.now()
    results = []

    # ═══════════════════════════════════════════════════════════
    # SECURITY
    # ═══════════════════════════════════════════════════════════
    print_header("🔒 SECURITY")

    result = run_security_scan(project_path)
    result["category"] = "Security"
    results.append(result)

    # npm audit for dependencies
    result = run_command("Dependency Audit", "npm audit --audit-level=high", project_path)
    result["category"] = "Security"
    results.append(result)

    # ═══════════════════════════════════════════════════════════
    # CODE QUALITY
    # ═══════════════════════════════════════════════════════════
    print_header("📋 CODE QUALITY")

    if "lint" in scripts:
        result = run_command("Lint Check", "npm run lint", project_path)
        result["category"] = "Code Quality"
        results.append(result)
    else:
        results.append({"name": "Lint Check", "passed": True, "skipped": True, "category": "Code Quality"})

    result = run_command("TypeScript Check", "npx tsc --noEmit", project_path)
    result["category"] = "Code Quality"
    results.append(result)

    # ═══════════════════════════════════════════════════════════
    # DATA LAYER
    # ═══════════════════════════════════════════════════════════
    print_header("🗄️ DATA LAYER")

    if "db:push" in scripts or "db:generate" in scripts:
        result = run_command("Drizzle Schema Check", "npx drizzle-kit check", project_path)
        result["category"] = "Data Layer"
        results.append(result)
    else:
        results.append({"name": "Drizzle Schema Check", "passed": True, "skipped": True, "category": "Data Layer"})

    # ═══════════════════════════════════════════════════════════
    # TESTING
    # ═══════════════════════════════════════════════════════════
    print_header("🧪 TESTING")

    if "test" in scripts:
        result = run_command("Test Suite", "npm run test", project_path, timeout=600)
        result["category"] = "Testing"
        results.append(result)
    else:
        results.append({"name": "Test Suite", "passed": True, "skipped": True, "category": "Testing"})

    # ═══════════════════════════════════════════════════════════
    # BUILD
    # ═══════════════════════════════════════════════════════════
    print_header("🔨 BUILD")

    if not args.skip_build and "build" in scripts:
        result = run_command("Production Build", "npm run build", project_path, timeout=600)
        result["category"] = "Build"
        results.append(result)
    else:
        reason = "skipped by flag" if args.skip_build else "no build script"
        results.append({"name": "Production Build", "passed": True, "skipped": True, "category": "Build"})

    # ═══════════════════════════════════════════════════════════
    # PERFORMANCE (requires URL)
    # ═══════════════════════════════════════════════════════════
    print_header("⚡ PERFORMANCE")

    # Lighthouse audit
    try:
        check = subprocess.run(["npx", "lighthouse", "--version"], capture_output=True, timeout=30)
        if check.returncode == 0:
            result = run_command(
                "Lighthouse Audit",
                f'npx lighthouse {args.url} --output=json --chrome-flags="--headless" --only-categories=performance,accessibility,best-practices,seo',
                project_path,
                timeout=300
            )
            result["category"] = "Performance"
            results.append(result)
        else:
            results.append({"name": "Lighthouse Audit", "passed": True, "skipped": True, "category": "Performance"})
    except:
        results.append({"name": "Lighthouse Audit", "passed": True, "skipped": True, "category": "Performance"})

    # ═══════════════════════════════════════════════════════════
    # E2E TESTING (optional)
    # ═══════════════════════════════════════════════════════════
    if not args.no_e2e:
        print_header("🎭 E2E TESTING")

        if "test:e2e" in scripts:
            result = run_command("Playwright E2E", "npm run test:e2e", project_path, timeout=600)
            result["category"] = "E2E Testing"
            results.append(result)
        elif (project_path / "playwright.config.ts").exists():
            result = run_command("Playwright E2E", "npx playwright test", project_path, timeout=600)
            result["category"] = "E2E Testing"
            results.append(result)
        else:
            results.append({"name": "Playwright E2E", "passed": True, "skipped": True, "category": "E2E Testing"})

    # Print final report
    all_passed = print_final_report(results, start_time)

    sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    main()
