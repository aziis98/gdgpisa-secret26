/**
 * Virtual Filesystem for Minix JS
 */
export class VFS {
    constructor() {
        this.root = this._mkdir("/", null)
        this.root.parent = this.root
        this.cwd = null
    }

    serialize(node = this.root) {
        const res = {
            type: node.type,
            name: node.name,
            mtime: node.mtime,
            mode: node.mode,
        }
        if (node.type === "file") {
            res.content = node.content
        } else {
            res.children = {}
            for (const [name, child] of node.children) {
                res.children[name] = this.serialize(child)
            }
        }
        return res
    }

    _mkdir(n, p) {
        return { type: "dir", name: n, children: new Map(), parent: p, mtime: Date.now(), mode: 0o755 }
    }

    _mkfile(name, content, parent) {
        return { type: "file", name, content, parent, mtime: Date.now(), mode: 0o644 }
    }

    mk(path, content) {
        const parts = path.split("/").filter(Boolean)
        let node = this.root
        for (let i = 0; i < parts.length - 1; i++) {
            if (!node.children.has(parts[i])) node.children.set(parts[i], this._mkdir(parts[i], node))
            node = node.children.get(parts[i])
        }

        const f = this._mkfile(parts.pop(), content, node)
        node.children.set(f.name, f)
        return f
    }

    resolve(path, base) {
        let node = (path ?? "").startsWith("/") ? this.root : (base ?? this.cwd)
        for (const p of (path ?? "").split("/").filter(Boolean)) {
            if (p === ".") continue
            if (p === "..") {
                node = node.parent
                continue
            }
            if (node.type !== "dir") return null
            node = node.children.get(p)
            if (!node) return null
        }
        return node
    }

    pathOf(node) {
        const parts = []
        let n = node
        while (n !== this.root) {
            parts.unshift(n.name)
            n = n.parent
        }
        return "/" + parts.join("/")
    }

    _split(path, base) {
        const parts = path.split("/").filter(Boolean)
        const name = parts.pop()
        if (!name) return null
        const parentPath = (path.startsWith("/") ? "/" : "") + parts.join("/")
        const parent = parts.length
            ? this.resolve(parentPath, base)
            : path.startsWith("/")
              ? this.root
              : (base ?? this.cwd)
        return parent ? { parent, name } : null
    }

    write(path, content, base) {
        let node = this.resolve(path, base)
        if (!node) {
            const r = this._split(path, base)
            if (!r) return null
            node = this._mkfile(r.name, content, r.parent)
            r.parent.children.set(node.name, node)
        } else if (node.type === "file") {
            node.content = content
            node.mtime = Date.now()
        }
        return node
    }
}
