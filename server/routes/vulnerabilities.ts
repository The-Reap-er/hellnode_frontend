import { RequestHandler } from "express";
import { VulnerabilityResponse } from "@shared/api";

export const handleVulnerabilities: RequestHandler = (req, res) => {
  // Mock vulnerability data - in a real app this would come from scanning services
  const vulnerabilityData: VulnerabilityResponse = {
    valid: true,
    message: "Kubeconfig is valid and all clusters are reachable",
    clusterStatuses: [
      {
        name: "kind-demo-cluster",
        server: "https://127.0.0.1:53266",
        reachable: true,
        nodes: [
          {
            name: "demo-cluster-control-plane",
            kubeletVersion: "v1.29.2",
            containerImages: [
              {
                name: "kube-controller-manager",
                image: "registry.k8s.io/kube-controller-manager:v1.29.2",
                vulnerabilities: []
              },
              {
                name: "nginx",
                image: "nginx:1.14.2",
                vulnerabilities: []
              },
              {
                name: "etcd",
                image: "registry.k8s.io/etcd:3.5.10-0",
                vulnerabilities: []
              }
            ]
          }
        ],
        apiVersions: ["autoscaling/v1", "autoscaling/v2", "v1"],
        permissions: {
          canListNodes: true,
          canListPods: true,
          canGetMetrics: false
        }
      },
      {
        name: "kind-shadow",
        server: "https://127.0.0.1:60905",
        reachable: true,
        nodes: [
          {
            name: "shadow-control-plane",
            kubeletVersion: "v1.29.2",
            containerImages: [
              {
                name: "coredns",
                image: "registry.k8s.io/coredns/coredns:v1.11.1",
                vulnerabilities: [
                  {
                    id: "e5f39a58b76834a13d5dd8121ae98831afa11c22614d8786f5b80435372da241",
                    category: "container_scanning",
                    message: "CVE-2024-51744 on github.com/golang-jwt/jwt@4.2.0",
                    description: "Unclear documentation of the error behavior in `ParseWithClaims` can lead to situation where users are potentially not checking errors in the way they should be. Especially, if a token is both expired and invalid, the errors returned by `ParseWithClaims` return both error codes. If users only check for the `jwt.ErrTokenExpired ` using `error.Is`, they will ignore the embedded `jwt.ErrTokenSignatureInvalid` and thus potentially accept invalid tokens.",
                    cve: "CVE-2024-51744",
                    severity: "Low",
                    solution: "Upgrade github.com/golang-jwt/jwt@4.2.0 to 4.5.1"
                  },
                  {
                    id: "824c689a7fb53cede6d9c1269aa17fcf0b52fa019b6928036d17a36917f0f4ae",
                    category: "container_scanning",
                    message: "CVE-2023-24539 on stdlib@1.20",
                    description: "Angle brackets (<>) are not considered dangerous characters when inserted into CSS contexts. Templates containing multiple actions separated by a '/' character can result in unexpectedly closing the CSS context and allowing for injection of unexpected HTML, if executed with untrusted input.",
                    cve: "CVE-2023-24539",
                    severity: "High",
                    solution: "Upgrade stdlib@1.20 to 1.20.4"
                  },
                  {
                    id: "e8e2647c0f4f5ea4aeb9705feec0ceaa15cc701f098fdbc1cde82774cbb6f9ce",
                    category: "container_scanning",
                    message: "CVE-2025-22871 on stdlib@1.20",
                    description: "The net/http package improperly accepts a bare LF as a line terminator in chunked data chunk-size lines. This can permit request smuggling if a net/http server is used in conjunction with a server that incorrectly accepts a bare LF as part of a chunk-ext.",
                    cve: "CVE-2025-22871",
                    severity: "Critical",
                    solution: "Upgrade stdlib@1.20 to 1.23.8"
                  }
                ]
              },
              {
                name: "kube-apiserver",
                image: "registry.k8s.io/kube-apiserver:v1.29.2",
                vulnerabilities: [
                  {
                    id: "277adbbd8498372c6dc748ac7afd9eeca6c26db0b5c28589e4020ca82c99bae7",
                    category: "container_scanning",
                    message: "CVE-2020-8912 on github.com/aws/aws-sdk-go@1.44.194",
                    description: "A vulnerability in the in-band key negotiation exists in the AWS S3 Crypto SDK for GoLang versions prior to V2. An attacker with write access to the targeted bucket can change the encryption algorithm of an object in the bucket, which can then allow them to change AES-GCM to AES-CTR. Using this in combination with a decryption oracle can reveal the authentication key used by AES-GCM as decrypting the GMAC tag leaves the authentication key recoverable as an algebraic equation.",
                    cve: "CVE-2020-8912",
                    severity: "Low",
                    solution: ""
                  }
                ]
              }
            ]
          }
        ],
        apiVersions: ["autoscaling/v2", "coordination.k8s.io/v1", "v1"],
        permissions: {
          canListNodes: true,
          canListPods: true,
          canGetMetrics: false
        }
      },
      {
        name: "orbstack",
        server: "https://127.0.0.1:26443",
        reachable: true,
        nodes: [
          {
            name: "orbstack",
            kubeletVersion: "v1.31.6+orb1",
            containerImages: [
              {
                name: "coredns",
                image: "rancher/mirrored-coredns-coredns:1.10.1",
                vulnerabilities: [
                  {
                    id: "d354552a374fc62706121115e9c965cc4c65d62cb4c860dc5efd6463e1c7ff2b",
                    category: "container_scanning",
                    message: "CVE-2025-22866 on stdlib@1.20",
                    description: "Due to the usage of a variable time instruction in the assembly implementation of an internal function, a small number of bits of secret scalars are leaked on the ppc64le architecture. Due to the way this function is used, we do not believe this leakage is enough to allow recovery of the private key when P-256 is used in any well known protocols.",
                    cve: "CVE-2025-22866",
                    severity: "Medium",
                    solution: "Upgrade stdlib@1.20 to 1.22.12"
                  },
                  {
                    id: "1924b09980e4cc16779ffec023757cb20c639bb91cf93c7a319886917da53612",
                    category: "container_scanning",
                    message: "CVE-2025-22870 on golang.org/x/net@0.4.0",
                    description: "Matching of hosts against proxy patterns can improperly treat an IPv6 zone ID as a hostname component. For example, when the NO_PROXY environment variable is set to \"*.example.com\", a request to \"[::1%25.example.com]:80` will incorrectly match and not be proxied.",
                    cve: "CVE-2025-22870",
                    severity: "Medium",
                    solution: "Upgrade golang.org/x/net@0.4.0 to 0.36.0"
                  }
                ]
              },
              {
                name: "local-path-provisioner",
                image: "rancher/local-path-provisioner:v0.0.31",
                vulnerabilities: [
                  {
                    id: "65ed24915088521f79395cc77e064ee68a7fe7eddc145a5608e00b53f7362b20",
                    category: "container_scanning",
                    message: "CVE-2025-22866 on stdlib@1.23.5",
                    description: "Due to the usage of a variable time instruction in the assembly implementation of an internal function, a small number of bits of secret scalars are leaked on the ppc64le architecture. Due to the way this function is used, we do not believe this leakage is enough to allow recovery of the private key when P-256 is used in any well known protocols.",
                    cve: "CVE-2025-22866",
                    severity: "Medium",
                    solution: "Upgrade stdlib@1.23.5 to 1.23.6"
                  },
                  {
                    id: "d99c2f5573ad26710437c59cf84ae96630eee87b9bde3a5420bbc9b2479a9095",
                    category: "container_scanning",
                    message: "CVE-2025-26519 on alpine/musl@1.2.5-r8",
                    description: "",
                    cve: "CVE-2025-26519",
                    severity: "High",
                    solution: "Upgrade alpine/musl@1.2.5-r8 to 1.2.5-r9"
                  },
                  {
                    id: "7daa99a3f0ef4a44c9a742782198fef526253e72cc33504987f7e59ed28a0696",
                    category: "container_scanning",
                    message: "CVE-2025-22871 on stdlib@1.23.5",
                    description: "The net/http package improperly accepts a bare LF as a line terminator in chunked data chunk-size lines. This can permit request smuggling if a net/http server is used in conjunction with a server that incorrectly accepts a bare LF as part of a chunk-ext.",
                    cve: "CVE-2025-22871",
                    severity: "Critical",
                    solution: "Upgrade stdlib@1.23.5 to 1.23.8"
                  }
                ]
              }
            ]
          }
        ],
        apiVersions: ["networking.k8s.io/v1", "v1", "apps/v1"],
        permissions: {
          canListNodes: true,
          canListPods: true,
          canGetMetrics: false
        }
      }
    ]
  };

  res.json(vulnerabilityData);
};
