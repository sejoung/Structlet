import { isSpecQuantity, NODE_SPEC_TEXT_LIMIT, type NodeSpecs } from '../../domain';
import { bool, FormatError, num, obj, str } from './reader';

export function readNodeSpecs(value: unknown, path: string): NodeSpecs {
  const o = obj(value, path);
  const text = (key: string) => o[key] === undefined ? undefined : str(o, key, path, { max: NODE_SPEC_TEXT_LIMIT });
  const quantity = (key: string) => {
    if (o[key] === undefined) return undefined;
    const number = num(o, key, path);
    if (!isSpecQuantity(number)) throw new FormatError(`${path}.${key}`, 'expected a positive quantity');
    return number;
  };
  const instanceType = text('instanceType');
  const vcpus = quantity('vcpus');
  const memoryGiB = quantity('memoryGiB');
  const gpu = text('gpu');
  const diskGiB = quantity('diskGiB');
  const showDetails = o.showDetails === undefined ? undefined : bool(o, 'showDetails', path, false);
  return {
    ...(instanceType !== undefined ? { instanceType } : {}),
    ...(vcpus !== undefined ? { vcpus } : {}),
    ...(memoryGiB !== undefined ? { memoryGiB } : {}),
    ...(gpu !== undefined ? { gpu } : {}),
    ...(diskGiB !== undefined ? { diskGiB } : {}),
    ...(showDetails !== undefined ? { showDetails } : {}),
  };
}
