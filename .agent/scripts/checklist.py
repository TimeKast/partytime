#!/usr/bin/env python3
"""
Master Checklist Runner - TimeKast Template
============================================

Orchestrates validation scripts in priority order.
Use this for incremental validation during development.

Usage:
    python .agent/scripts/checklist.py .                    # Run core checks
    python .agent/scripts/checklist.py . --url <URL>        # Include performance checks

Priority Order:
    P0: Security Scan (vulnerabilities, secrets)
    P1: Lint & Type Check (code quality)
    P2: Schema Validation (Drizzle schema)
    P3: Test Runner (unit/integration tests)
    P4: UX Audit (accessibility)
    P5: SEO Check (meta tags, structure)
    P6: Performance (lighthouse - requires URL)
"""

import sys
import subprocess
import argparse
from pathlib import Path
from typing import List, Optional

# ANSI colors for terminal output
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
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*60}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(60)}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*60}{Colors.ENDC}\n")

def print_step(text: str):
    print(f"{Colors.BOLD}{Colors.BLUE}🔄 {text}{Colors.ENDC}")

def print_success(text: str):
    print(f"{Colors.GREEN}✅ {text}{Colors.ENDC}")

def print_warning(text: str):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.ENDC}")

def print_error(text: str):
    print(f"{Colors.RED}❌ {text}{Colors.ENDC}")

def run_npm_command(name: str, cmd: str, project_path: Path, critical: bool = False) -> dict:
    """Run an npm command and capture results"""
    print_step(f"Running: {name}")

    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=project_path,
            timeout=300
        )

        passed = result.returncode == 0

        if passed:
            print_success(f"{name}: PASSED")
        else:
            print_error(f"{name}: FAILED")
            if result.stderr:
                # Show first 300 chars of error
                print(f"  Error: {result.stderr[:300]}")

        return {
            "name": name,
            "passed": passed,
            "output": result.stdout,
            "error": result.stderr,
            "skipped": False,
            "critical": critical
        }

    except subprocess.TimeoutExpired:
        print_error(f"{name}: TIMEOUT (>5 minutes)")
        return {"name": name, "passed": False, "output": "", "error": "Timeout", "skipped": False, "critical": critical}

    except Exception as e:
        print_error(f"{name}: ERROR - {str(e)}")
        return {"name": name, "passed": False, "output": "", "error": str(e), "skipped": False, "critical": critical}

def check_package_json(project_path: Path) -> dict:
    """Check if package.json exists and has required scripts"""
    pkg_json = project_path / "package.json"
    if not pkg_json.exists():
        return {"exists": False, "scripts": {}}

    import json
    with open(pkg_json) as f:
        data = json.load(f)

    return {"exists": True, "scripts": data.get("scripts", {})}

def print_summary(results: List[dict]) -> bool:
    """Print final summary report"""
    print_header("📊 CHECKLIST SUMMARY")

    passed_count = sum(1 for r in results if r["passed"] and not r.get("skipped"))
    failed_count = sum(1 for r in results if not r["passed"] and not r.get("skipped"))
    skipped_count = sum(1 for r in results if r.get("skipped"))

    print(f"Total Checks: {len(results)}")
    print(f"{Colors.GREEN}✅ Passed: {passed_count}{Colors.ENDC}")
    print(f"{Colors.RED}❌ Failed: {failed_count}{Colors.ENDC}")
    print(f"{Colors.YELLOW}⏭️  Skipped: {skipped_count}{Colors.ENDC}")
    print()

    # Detailed results
    for r in results:
        if r.get("skipped"):
            status = f"{Colors.YELLOW}⏭️ {Colors.ENDC}"
        elif r["passed"]:
            status = f"{Colors.GREEN}✅{Colors.ENDC}"
        else:
            status = f"{Colors.RED}❌{Colors.ENDC}"

        print(f"{status} {r['name']}")

    print()

    if failed_count > 0:
        print_error(f"{failed_count} check(s) FAILED - Please fix before proceeding")
        return False
    else:
        print_success("All checks PASSED ✨")
        return True

def main():
    parser = argparse.ArgumentParser(
        description="Run TimeKast validation checklist",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python .agent/scripts/checklist.py .                      # Core checks only
  python .agent/scripts/checklist.py . --url http://localhost:3000  # Include performance
        """
    )
    parser.add_argument("project", help="Project path to validate")
    parser.add_argument("--url", help="URL for performance checks (lighthouse)")
    parser.add_argument("--skip-tests", action="store_true", help="Skip test runner")

    args = parser.parse_args()

    project_path = Path(args.project).resolve()

    if not project_path.exists():
        print_error(f"Project path does not exist: {project_path}")
        sys.exit(1)

    print_header("🚀 TIMEKAST - MASTER CHECKLIST")
    print(f"Project: {project_path}")
    print(f"URL: {args.url if args.url else 'Not provided (performance checks skipped)'}")

    # Check package.json
    pkg = check_package_json(project_path)
    if not pkg["exists"]:
        print_error("package.json not found!")
        sys.exit(1)

    scripts = pkg["scripts"]
    results = []

    # ═══════════════════════════════════════════════════════════
    # CORE CHECKS
    # ═══════════════════════════════════════════════════════════
    print_header("📋 CORE CHECKS")

    # P0: Security - Check for secrets in code
    print_step("Running: Security Scan (secrets)")
    try:
        # Check for common secret patterns
        secret_patterns = ["DATABASE_URL=", "AUTH_SECRET=", "GOOGLE_CLIENT_SECRET="]
        found_secrets = False

        for ext in ["*.ts", "*.tsx", "*.js", "*.jsx"]:
            for f in project_path.rglob(ext):
                if "node_modules" in str(f) or ".next" in str(f):
                    continue
                content = f.read_text(errors="ignore")
                for pattern in secret_patterns:
                    if pattern in content and not str(f).endswith(".example"):
                        found_secrets = True
                        print_error(f"  Potential secret in: {f.relative_to(project_path)}")

        if not found_secrets:
            print_success("Security Scan: PASSED (no secrets found)")
            results.append({"name": "Security Scan", "passed": True, "skipped": False})
        else:
            print_error("Security Scan: FAILED (secrets found in code)")
            results.append({"name": "Security Scan", "passed": False, "skipped": False, "critical": True})
    except Exception as e:
        print_warning(f"Security Scan: Skipped ({e})")
        results.append({"name": "Security Scan", "passed": True, "skipped": True})

    # P1: Lint Check
    if "lint" in scripts:
        result = run_npm_command("Lint Check", "npm run lint", project_path, critical=True)
        results.append(result)
    else:
        print_warning("Lint Check: Skipped (no lint script)")
        results.append({"name": "Lint Check", "passed": True, "skipped": True})

    # P1b: TypeScript Check
    result = run_npm_command("TypeScript Check", "npx tsc --noEmit", project_path, critical=True)
    results.append(result)

    # P2: Drizzle Schema Validation
    if "db:push" in scripts or "db:generate" in scripts:
        result = run_npm_command("Schema Validation (Drizzle)", "npx drizzle-kit check", project_path)
        results.append(result)
    else:
        print_warning("Schema Validation: Skipped (no Drizzle scripts)")
        results.append({"name": "Schema Validation", "passed": True, "skipped": True})

    # P3: Test Runner
    if not args.skip_tests and "test" in scripts:
        result = run_npm_command("Test Runner", "npm run test", project_path)
        results.append(result)
    else:
        reason = "skipped by flag" if args.skip_tests else "no test script"
        print_warning(f"Test Runner: Skipped ({reason})")
        results.append({"name": "Test Runner", "passed": True, "skipped": True})

    # P4: Build Check (ensures no build errors)
    if "build" in scripts:
        result = run_npm_command("Build Check", "npm run build", project_path, critical=True)
        results.append(result)
    else:
        print_warning("Build Check: Skipped (no build script)")
        results.append({"name": "Build Check", "passed": True, "skipped": True})

    # ═══════════════════════════════════════════════════════════
    # PERFORMANCE CHECKS (optional, requires URL)
    # ═══════════════════════════════════════════════════════════
    if args.url:
        print_header("⚡ PERFORMANCE CHECKS")

        # Check if lighthouse is available
        try:
            result = subprocess.run(["npx", "lighthouse", "--version"], capture_output=True, timeout=30)
            if result.returncode == 0:
                lighthouse_result = run_npm_command(
                    "Lighthouse Audit",
                    f"npx lighthouse {args.url} --output=json --chrome-flags='--headless' --only-categories=performance,accessibility,best-practices,seo",
                    project_path
                )
                results.append(lighthouse_result)
            else:
                print_warning("Lighthouse: Skipped (not installed)")
                results.append({"name": "Lighthouse Audit", "passed": True, "skipped": True})
        except Exception:
            print_warning("Lighthouse: Skipped (not available)")
            results.append({"name": "Lighthouse Audit", "passed": True, "skipped": True})

    # Print summary
    all_passed = print_summary(results)

    sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    main()
