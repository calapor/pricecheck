# Diagrams

Architecture and flow diagrams are authored in **PlantUML**. The `.puml` file is the
**source of truth**; the same-named `.png` is the rendered image embedded in the docs.

| Source | Rendered | Used in |
|--------|----------|---------|
| `architecture.puml` | `architecture.png` | `README.md`, `specs/architecture.md` |
| `scrape-flow.puml` | `scrape-flow.png` | `specs/architecture.md` |
| `cicd-pipeline.puml` | `cicd-pipeline.png` | `specs/ci-cd-pipeline.md` |
| `jenkins-pipeline.puml` | `jenkins-pipeline.png` | `specs/jenkins-setup.md` |

## Editing

1. Edit the `.puml` (never hand-edit the `.png`, and don't re-introduce ASCII
   `├──`/`└──` flow blocks in the markdown — they were intentionally replaced).
2. Re-render the PNG.
3. Commit the `.puml` and `.png` together.

## Rendering

GitHub does not render PlantUML natively, so we commit PNGs. Render with **Kroki**
(no local PlantUML/Graphviz needed):

```bash
curl -sS -X POST -H "Content-Type: text/plain" \
  --data-binary @architecture.puml https://kroki.io/plantuml/png -o architecture.png
```

Or, if PlantUML + Graphviz are installed locally:

```bash
plantuml -tpng architecture.puml
```
