import { Boxes, Box, CalendarClock, Cog, FileCog, FileKey, GitBranch, GitFork, HardDrive, Layers, Package, Repeat, Scaling, Server, ServerCog, Signpost, Split } from 'lucide';
import { define, type Row } from './types.ts';

const ROWS: Row[] = [
  ['k8s.deployment', 'Deployment', '디플로이먼트', Boxes, 'compute', 'deploy workload replicas'],
  ['k8s.statefulset', 'StatefulSet', '스테이트풀셋', HardDrive, 'compute', 'sts stateful'],
  ['k8s.daemonset', 'DaemonSet', '데몬셋', Server, 'compute', 'ds node agent'],
  ['k8s.job', 'Job', '잡', Cog, 'compute', 'batch'],
  ['k8s.cronjob', 'CronJob', '크론잡', CalendarClock, 'compute', 'cron schedule'],
  ['k8s.pod', 'Pod', '파드', Box, 'compute', 'pod'],
  ['k8s.service', 'Service', '서비스', Split, 'network', 'svc clusterip loadbalancer'],
  ['k8s.ingress', 'Ingress', '인그레스', Signpost, 'network', 'ing gateway httproute'],
  ['k8s.configmap', 'ConfigMap', '컨피그맵', FileCog, 'operations', 'cm config'],
  ['k8s.secret', 'Secret', '시크릿', FileKey, 'security', 'secret'],
  ['k8s.storageclass', 'StorageClass', '스토리지 클래스', HardDrive, 'storage', 'storageclass provisioner binding reclaim'],
  ['k8s.pvc', 'PersistentVolumeClaim', '영구 볼륨 클레임', HardDrive, 'storage', 'pvc volume pv'],
  ['k8s.hpa', 'HorizontalPodAutoscaler', '수평 파드 오토스케일러', Scaling, 'operations', 'hpa autoscale'],
  ['k8s.argocd-application', 'Argo CD Application', 'Argo CD 애플리케이션', GitBranch, 'operations', 'argocd gitops sync delivery'],
  ['k8s.argocd-applicationset', 'Argo CD ApplicationSet', 'Argo CD 애플리케이션 세트', GitFork, 'operations', 'argocd gitops generator'],
  ['k8s.karpenter-nodepool', 'Karpenter NodePool', 'Karpenter 노드 풀', Layers, 'compute', 'karpenter autoscale pool'],
  ['k8s.karpenter-ec2nodeclass', 'Karpenter EC2NodeClass', 'Karpenter EC2 노드 클래스', ServerCog, 'compute', 'karpenter node class ami ec2'],
  ['k8s.helm', 'Helm release', 'Helm 릴리스', Package, 'operations', 'helm chart'],
  ['k8s.replicaset', 'ReplicaSet', '레플리카셋', Repeat, 'compute', 'rs'],
];

export const K8S_SERVICES = define('k8s', ROWS);
