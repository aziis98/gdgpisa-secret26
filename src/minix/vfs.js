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
    deserialize(data) {
        this.root = this._deserializeNode(data, null)
        this.root.parent = this.root
        return this
    }

    _deserializeNode(data, parent) {
        const node =
            data.type === "dir"
                ? this._mkdir(data.name, parent)
                : this._mkfile(data.name, data.content, parent)
        node.mtime = data.mtime
        node.mode = data.mode
        if (data.type === "dir") {
            for (const [name, childData] of Object.entries(data.children)) {
                node.children.set(name, this._deserializeNode(childData, node))
            }
        }
        return node
    }

    _mkdir(n, p) {
        return { type: "dir", name: n, children: new Map(), parent: p, mtime: Date.now(), mode: 0o755 }
    }

    _mkfile(name, content, parent) {
        return { type: "file", name, content, parent, mtime: Date.now(), mode: 0o644 }
    }

    _ensure(path) {
        const parts = path.split("/").filter(Boolean)
        let node = this.root
        for (const p of parts) {
            if (!node.children.has(p)) node.children.set(p, this._mkdir(p, node))
            node = node.children.get(p)
            if (node.type !== "dir") return null
        }
        return node
    }

    mk(path, content) {
        const parts = path.split("/").filter(Boolean)
        const name = parts.pop()
        const parent = this._ensure(parts.join("/"))
        if (!parent) return null
        const f = this._mkfile(name, content, parent)
        parent.children.set(f.name, f)
        return f
    }

    mkdir(path) {
        const r = this._split(path)
        if (!r) return null
        if (r.parent.children.has(r.name)) return null
        const d = this._mkdir(r.name, r.parent)
        r.parent.children.set(d.name, d)
        return d
    }

    rm(path, recursive = false) {
        const node = this.resolve(path)
        if (!node || node === this.root) return false
        if (node.type === "dir" && node.children.size > 0 && !recursive) return false
        node.parent.children.delete(node.name)
        return true
    }

    rename(oldPath, newPath) {
        const node = this.resolve(oldPath)
        if (!node || node === this.root) return false
        const r = this._split(newPath)
        if (!r) return false
        if (r.parent.children.has(r.name)) return false

        node.parent.children.delete(node.name)
        node.name = r.name
        node.parent = r.parent
        r.parent.children.set(node.name, node)
        return true
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
