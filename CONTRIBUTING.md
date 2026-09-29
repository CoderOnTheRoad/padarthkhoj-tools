# Contributing to Padarthkhoj Tools

Thank you for helping improve Padarthkhoj Tools.

## Before submitting a change

1. Create a focused branch for the change.
2. Do not commit credentials, unpublished private datasets, proprietary pseudopotentials, or calculation outputs without redistribution permission.
3. Preserve existing scientific data contracts and document any intentional format change.
4. Add or update regression tests for parser, generator, numerical, or visualization behaviour.
5. Run the complete quality gate:

   ```bash
   npm ci
   npm run check
   ```

## Scientific changes

Describe the physical convention, equations, units, reference source, assumptions, and validation case used for a scientific change. Generated inputs and derived quantities must remain user-verifiable; defaults must not be presented as universally converged settings.

## Reporting problems

For ordinary defects and feature requests, open a GitHub issue with a minimal reproducible input where redistribution is permitted. Do not attach confidential structures or unpublished data to a public issue.
