export interface HintArgument {
  name: string;
  required: boolean;
  variadic: boolean;
}

export interface UnknownOptionHintInput {
  message: string;
  commandPath: string[];
  usage: string;
  arguments: HintArgument[];
}

function normalizeName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Commander 오류 메시지에서 알 수 없는 긴 옵션의 이름을 꺼낸다. */
export function parseUnknownOptionName(message: string): string | undefined {
  return /unknown option '--([^'=]+)/.exec(message)?.[1];
}

/**
 * 옵션 이름이 가리키는 위치 인수를 찾는다.
 * 이름이 같으면 그 인수를 고르고, 아니면 앞부분이 같거나 명령 경로 단계 이름이 앞에 붙은 인수가 하나뿐일 때만 고른다.
 */
export function findReferencedArgument(
  optionName: string,
  commandPath: string[],
  argumentNames: string[],
): string | undefined {
  const option = normalizeName(optionName);
  const normalized = argumentNames.map(normalizeName);

  const exact = normalized.indexOf(option);
  if (exact !== -1) {
    return argumentNames[exact];
  }

  const prefixed = argumentNames.filter((_, i) => normalized[i].startsWith(`${option}-`));
  const candidates = new Set<string>(prefixed.length === 1 ? prefixed : []);

  const segments = commandPath.slice(1).map(normalizeName);
  argumentNames.forEach((name, i) => {
    const otherArguments = normalized.filter((_, j) => j !== i);
    const matched = segments.some(
      (segment) => !otherArguments.includes(segment) && option === `${segment}-${normalized[i]}`,
    );
    if (matched) {
      candidates.add(name);
    }
  });

  return candidates.size === 1 ? [...candidates][0] : undefined;
}

function formatArgument(argument: HintArgument): string {
  const name = argument.variadic ? `${argument.name}...` : argument.name;
  return argument.required ? `<${name}>` : `[${name}]`;
}

/** 알 수 없는 옵션이 위치 인수를 가리키면 stderr에 덧붙일 안내 두 줄을 만든다. 해당하지 않으면 빈 문자열이다. */
export function buildUnknownOptionHint(input: UnknownOptionHintInput): string {
  if (input.message.includes("(Did you mean")) {
    return "";
  }

  const optionName = parseUnknownOptionName(input.message);
  if (optionName === undefined) {
    return "";
  }

  const referenced = findReferencedArgument(
    optionName,
    input.commandPath,
    input.arguments.map((argument) => argument.name),
  );
  const argument = input.arguments.find((candidate) => candidate.name === referenced);
  if (argument === undefined) {
    return "";
  }

  return (
    `안내: --${optionName} 는 옵션이 아닙니다. 위치 인수 ${formatArgument(argument)} 로 전달하세요.\n` +
    `사용법: ${input.commandPath.join(" ")} ${input.usage}\n`
  );
}
