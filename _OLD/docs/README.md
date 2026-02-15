# GerbX Documentation

## Technical Documentation

- **[GERBER_CONVERSION.md](./GERBER_CONVERSION.md)** - Critical reading for anyone working on Gerber parsing/conversion. Explains coordinate systems, common pitfalls, and verification methodology.

## Quick Start

Before making changes to Gerber conversion logic, **read GERBER_CONVERSION.md first**. It will save you hours of debugging coordinate system mismatches.

## Development Scripts

### Diagnostic Tools

```bash
# Test gerber-to-svg library directly
npx tsx scripts/test-gerber-to-svg.ts

# Debug custom parser
npx tsx scripts/debug-parser.ts

# Run conversion verification
npx tsx scripts/verify-conversion.ts
```

### Docker Testing

**Important**: After making changes to parser/conversion logic, rebuild the container:

```bash
# Rebuild and restart
docker-compose down
docker-compose up --build

# Or use Docker Compose V2
docker compose down
docker compose up --build
```

### Workflows

Use the agent workflows for common tasks:
- `/debug_gerber_parser` - Run visual debugger
- `/verify_gerber_conversion` - Quick verification check

## Key Findings

⚠️ **Do not compare Gerber parser bounds with KiCad SVG viewBox** - they use different coordinate systems. See GERBER_CONVERSION.md for details.
