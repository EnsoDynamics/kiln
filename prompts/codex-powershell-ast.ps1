# Parse recorded evidence as data. Never invoke its script blocks or load profiles.
$ErrorActionPreference = 'Stop'
$source = [Console]::In.ReadToEnd()
if ([Text.Encoding]::UTF8.GetByteCount($source) -gt 1048576) { throw 'Evidence exceeds parser bound' }
$tokens = $null
$errors = $null
$tree = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
$script:visited = 0
function Describe-Ast($node) {
  if ($null -eq $node) { return $null }
  $script:visited++
  if ($script:visited -gt 50000) { throw 'AST traversal bound exceeded' }
  $kind = $node.GetType().Name
  $result = @{ type = $kind }
  switch ($kind) {
    'ScriptBlockAst' {
      if ($node.ParamBlock -or $node.BeginBlock -or $node.ProcessBlock -or $node.CleanBlock -or $node.DynamicParamBlock) { throw 'Unsupported script block' }
      $result.body = Describe-Ast $node.EndBlock
    }
    'NamedBlockAst' { $result.statements = @($node.Statements | ForEach-Object { Describe-Ast $_ }) }
    'StatementBlockAst' { $result.statements = @($node.Statements | ForEach-Object { Describe-Ast $_ }) }
    'PipelineAst' { $result.elements = @($node.PipelineElements | ForEach-Object { Describe-Ast $_ }); $result.background = $node.Background }
    'CommandExpressionAst' { $result.expression = Describe-Ast $node.Expression; $result.redirections = @($node.Redirections | ForEach-Object { Describe-Ast $_ }) }
    'CommandAst' { $result.elements = @($node.CommandElements | ForEach-Object { Describe-Ast $_ }); $result.invocation = $node.InvocationOperator.ToString(); $result.redirections = @($node.Redirections | ForEach-Object { Describe-Ast $_ }) }
    'StringConstantExpressionAst' { $result.value = $node.Value }
    'ConstantExpressionAst' { $result.value = $node.Value }
    'ExpandableStringExpressionAst' { if ($node.NestedExpressions.Count -gt 0) { throw 'Uncaptured string expansion' }; $result.value = $node.Value }
    'VariableExpressionAst' { $result.variable = $node.VariablePath.UserPath; $result.splatted = $node.Splatted }
    'CommandParameterAst' { $result.name = $node.ParameterName; $result.argument = Describe-Ast $node.Argument }
    'AssignmentStatementAst' { $result.left = Describe-Ast $node.Left; $result.right = Describe-Ast $node.Right; $result.operator = $node.Operator.ToString() }
    'FileRedirectionAst' { $result.path = Describe-Ast $node.Location }
    'IfStatementAst' { $result.branches = @($node.Clauses | ForEach-Object { @{ condition = Describe-Ast $_.Item1; body = Describe-Ast $_.Item2 } }); $result.otherwise = Describe-Ast $node.ElseClause }
    default { throw "Unsupported AST: $kind" }
  }
  return $result
}
if ($errors.Count -gt 0) { throw 'PowerShell evidence has parse errors' }
@{ version = $PSVersionTable.PSVersion.ToString(); aliases = @((Get-Alias).Name); ast = (Describe-Ast $tree) } | ConvertTo-Json -Depth 100 -Compress
