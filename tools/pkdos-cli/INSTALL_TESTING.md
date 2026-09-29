# Install and test from another machine

After pushing the repository to GitHub, you can test it on another machine with:

```bash
git clone https://github.com/<your-username>/pkdos.git
cd pkdos
python -m pip install -e .
pkdos --help
```

For the example workflow:

```bash
make example
```
