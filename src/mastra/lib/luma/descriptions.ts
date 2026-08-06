export const GENERATED_HOSTS_SEPARATOR = '\n---\n**Hosted by**\n';
export const RECORDING_NOTICE = 'Recording and code examples will be available to everyone who registers.';

export interface LumaDescriptionHost {
  name: string;
  area?: string;
  title?: string;
  company?: string;
  xHandle?: string;
  website?: string;
}

function isRecordingNotice(line: string): boolean {
  const plainText = line.trim().replace(/^[*_]+|[*_]+$/g, '').trim();
  return plainText.toLowerCase() === RECORDING_NOTICE.toLowerCase();
}

export function getCustomDescription(description: string): string {
  const lines = description.split(GENERATED_HOSTS_SEPARATOR, 1)[0].split('\n');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined || !isRecordingNotice(line)) {
      continue;
    }

    let precedingIndex = index - 1;
    while (precedingIndex >= 0 && !lines[precedingIndex].trim()) {
      precedingIndex -= 1;
    }

    const removeFrom = lines[precedingIndex]?.trim() === '---' ? precedingIndex : index;
    lines.splice(removeFrom, index - removeFrom + 1);
  }

  return lines.join('\n').trim();
}

function buildHostsSection(hosts: readonly LumaDescriptionHost[]): string {
  return hosts.map((host) => {
    const hostDetails = [host.name, host.title || host.area, host.company].filter(Boolean).join(', ');
    const subItems: string[] = [];
    if (host.xHandle) {
      subItems.push(`  - https://x.com/${host.xHandle}`);
    }
    if (host.website) {
      subItems.push(`  - ${host.website}`);
    }
    const line = `- ${hostDetails}`;
    return subItems.length > 0 ? `${line}\n${subItems.join('\n')}` : line;
  }).join('\n');
}

export function buildLumaDescription(
  hosts: readonly LumaDescriptionHost[],
  customDescription = '',
): string {
  const parts: string[] = [];
  const sanitizedDescription = getCustomDescription(customDescription);

  if (sanitizedDescription) {
    parts.push(sanitizedDescription);
  }

  parts.push('');
  parts.push('---');
  parts.push('**Hosted by**');
  parts.push('');
  parts.push(buildHostsSection(hosts));
  parts.push('');
  parts.push(`*${RECORDING_NOTICE}*`);

  return parts.join('\n');
}
