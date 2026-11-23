import { Activity, Boxes, CircuitBoard, Cog, Cpu, Grid2X2, Network, Router, Server } from 'lucide';
import { define, type Row } from './types';

const ROWS: Row[] = [
  ['nvidia.gpu', 'NVIDIA GPU', 'NVIDIA GPU', Cpu, 'compute', 'gpu accelerator accelerators a100 h100 h200 b200 b300 l4 l40s blackwell hopper ampere rubin 그래픽 가속기 엔비디아 머신러닝'],
  ['nvidia.mig', 'MIG instance', 'MIG 인스턴스', Grid2X2, 'compute', 'multi instance gpu slice partition 분할 격리 엔비디아'],
  ['nvidia.nvlink-switch', 'NVLink Switch', 'NVLink 스위치', Network, 'network', 'nvswitch nvlink scale-up fabric 스케일업 엔비디아'],
  ['nvidia.connectx', 'ConnectX NIC', 'ConnectX 네트워크 어댑터', CircuitBoard, 'network', 'nic rdma infiniband ethernet roce gpudirect 네트워크 카드 엔비디아'],
  ['nvidia.quantum', 'Quantum InfiniBand Switch', 'Quantum InfiniBand 스위치', Router, 'network', 'infiniband fabric scale-out rdma 스케일아웃 엔비디아'],
  ['nvidia.spectrum-x', 'Spectrum-X Ethernet Switch', 'Spectrum-X 이더넷 스위치', Router, 'network', 'ethernet roce fabric scale-out rdma 스케일아웃 엔비디아'],
  ['nvidia.gpu-operator', 'GPU Operator', 'GPU 오퍼레이터', Cog, 'operations', 'kubernetes k8s operator 쿠버네티스 운영 엔비디아'],
  ['nvidia.mig-manager', 'MIG Manager', 'MIG 관리자', Cog, 'operations', 'kubernetes operator partition 구성 분할 엔비디아'],
  ['nvidia.device-plugin', 'GPU Device Plugin', 'GPU 디바이스 플러그인', Boxes, 'operations', 'kubernetes k8s allocation nvidia.com/gpu 쿠버네티스 자원 할당 엔비디아'],
  ['nvidia.dcgm-exporter', 'DCGM Exporter', 'DCGM 익스포터', Activity, 'operations', 'prometheus metrics monitoring 모니터링 메트릭 엔비디아'],
  ['nvidia.nim', 'NVIDIA NIM', 'NVIDIA NIM', Server, 'compute', 'inference model serving llm microservice 추론 모델 서빙 엔비디아'],
  ['nvidia.triton', 'Triton Inference Server', 'Triton 추론 서버', Server, 'compute', 'inference model serving triton 추론 모델 서빙 엔비디아'],
];

export const NVIDIA_SERVICES = define('nvidia', ROWS);
