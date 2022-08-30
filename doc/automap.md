# Formal Grammar for DDNet Automap files

```
Comment = #.*\n
Space = " " // 1 space only, no tabs
EndLine = ".*\n"

File = Config*
Config = Header Run*

Header = "[" (name= .*) "]" EndLine
Run = NoLayerCopy* IndexRules (NewRun Run)* | ε
NewRun = "NewRun" EndLine
IndexRules = Index (Pos | Random | NoDefaultRule | NoLayerCopy)*
Index = "Index" (id= \d) Orient? EndLine
Orient = Flag{0,3}
Flag = "XFLIP" | "YFLIP" | "ROTATE"
Pos = "Pos" (x= \d) (y= \d) (rule= PosRule) EndLine
PosRule = "EMPTY" | "FULL" | Index
Index = ("INDEX" | "NOTINDEX") IndexList
IndexList = (id= \d) (Orient | "NONE" | ε) ("OR" IndexList)?
Random = "Random" Float EndLine
Float = scanf("%f") "%"?
NoDefaultRule = "NoDefaultRule" EndLine
NoLayerCopy = "NoLayerCopy" EndLine
```

This is not a grammar of everything that is accepted by the DDNet parser. DDNet parser is more permissive than that.

DDNet parser:
 - Silently ignores every line that isn't recognised
 - Silently ignores everything left at the end of a line
 - Allows `(Flag | "NONE"){0,4}` in `IndexList`, in this case everything before a `"NONE"` is discarded.  
 - Allows `scanf(%f%c)` in `Float`, but the char is ignored if different than percent sign.

Other constraints:
 - all strings are max 127 chars (\0 not included)
 - all numbers are I32s
