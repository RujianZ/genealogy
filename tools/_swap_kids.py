"""把 person() 里那段内联的子女计算换成调用 kidsOf。"""
import io
import sys

sys.stdout.reconfigure(encoding="utf-8")
p = "src/core/entries.ts"
s = io.open(p, encoding="utf-8").read()
start = s.index("    // ══ 子女 ══\n")
tail = "    if (kidRows.length) relations.push(rel('子女', kidRows));"
end = s.index(tail)
s = s[:start] + "    // ══ 子女 ══（怎么算的见上面的 kidsOf）\n    const kidRows = kidsOf(pid);\n" + s[end:]
io.open(p, "w", encoding="utf-8").write(s)
print("换掉了", end - start, "个字符")
